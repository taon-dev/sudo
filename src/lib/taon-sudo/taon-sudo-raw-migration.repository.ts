//#region imports
import { open } from 'node:fs/promises'; // @esmRemove
import type { FileHandle } from 'node:fs/promises';
import { Readable, Writable } from 'node:stream'; // @esmRemove
import { pipeline } from 'node:stream/promises'; // @esmRemove

import type { R2Bucket } from '@cloudflare/workers-types';
import {
  Reader,
  TextReader,
  TextWriter,
  ZipReader,
  ZipWriter,
} from '@zip.js/zip.js';
import type { FileEntry } from '@zip.js/zip.js';
import type { Dirent } from 'fs-extra';
import {
  ClassHelpers,
  EndpointContext,
  Models,
  TaonBaseCustomRepository,
  TaonBaseStorageController,
  TaonRepository,
  TaonUploadedFile,
  TaonStorageObject,
} from 'taon/src';
import type { Repository } from 'taon-typeorm/src';
import { fse, GlobalStorage, path, UtilsOs } from 'tnp-core/src';

import {
  TaonSudoRawMigrationBucketController,
  TaonSudoRawMigrationEntity,
  TaonSudoRawMigrationFile,
  TaonSudoRawMigrationJobUpdate,
  TaonSudoRawMigrationManifest,
  TaonSudoRawMigrationSummary,
} from './taon-sudo-raw-migration.models';
import { TaonSudoSnapshotEntity } from './taon-sudo-snapshot.entity';
import { TaonSudoUtils } from './taon-sudo.utils';
//#endregion

const RAW_MIGRATION_ROOT = 'TaonSudoRawMigrations';
const SNAPSHOT_FORMAT = 'taon-sudo-raw-migration';
const ROW_BATCH_SIZE = 250;
const RAW_VALUE_MARKER = '__taonSudoRawMigrationValue';

//#region encode raw value
function encodeRawValue(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return { [RAW_VALUE_MARKER]: 'bigint', value: value.toString() };
  }
  if (value instanceof Date) {
    return { [RAW_VALUE_MARKER]: 'date', value: value.toISOString() };
  }
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
    return {
      [RAW_VALUE_MARKER]: 'buffer',
      value: value.toString('base64'),
    };
  }
  if (value instanceof ArrayBuffer) {
    return {
      [RAW_VALUE_MARKER]: 'uint8array',
      value: Array.from(new Uint8Array(value)),
    };
  }
  if (ArrayBuffer.isView(value)) {
    return {
      [RAW_VALUE_MARKER]: 'uint8array',
      value: Array.from(
        new Uint8Array(value.buffer, value.byteOffset, value.byteLength),
      ),
    };
  }
  if (Array.isArray(value)) {
    return value.map(encodeRawValue);
  }
  if (value && typeof value === 'object') {
    const encoded = Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, encodeRawValue(child)]),
    );
    if (RAW_VALUE_MARKER in value) {
      return { [RAW_VALUE_MARKER]: 'object', value: encoded };
    }
    return encoded;
  }
  return value;
}
//#endregion

//#region decode raw value
function decodeRawValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(decodeRawValue);
  }
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    if (
      typeof object[RAW_VALUE_MARKER] === 'string' &&
      Object.keys(object).length === 2 &&
      'value' in object
    ) {
      switch (object[RAW_VALUE_MARKER]) {
        case 'bigint':
          return BigInt(String(object.value));
        case 'date':
          return new Date(String(object.value));
        case 'buffer':
          return Buffer.from(String(object.value), 'base64');
        case 'uint8array':
          if (
            Array.isArray(object.value) &&
            object.value.every(
              item => Number.isInteger(item) && item >= 0 && item <= 255,
            )
          ) {
            return Uint8Array.from(object.value);
          }
          throw new Error('Invalid binary value in raw migration snapshot.');
        case 'object':
          return decodeRawValue(object.value);
      }
    }
    return Object.fromEntries(
      Object.entries(object).map(([key, child]) => [
        key,
        decodeRawValue(child),
      ]),
    );
  }
  return value;
}
//#endregion

//#region models
interface SnapshotOptions {
  onProgress: (update: TaonSudoRawMigrationJobUpdate) => void;
  isCancelled: () => boolean;
}

interface RestoreOptions {
  jobId: string;
  clearAllData?: boolean;
  onProgress: (update: TaonSudoRawMigrationJobUpdate) => void;
}

interface BucketBackup {
  controllerName: string;
  files: TaonStorageObject[];
}

class LocalZipRangeReader extends Reader<undefined> {
  constructor(
    private readonly file: FileHandle,
    size: number,
  ) {
    super(undefined);
    this.size = size;
  }

  //#region methods / read uint8 array
  override async readUint8Array(
    offset: number,
    length: number,
  ): Promise<Uint8Array> {
    //#region @backendFunc
    if (
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      !Number.isSafeInteger(length) ||
      length < 0
    ) {
      throw new Error('Invalid ZIP file range.');
    }
    const requested = Math.min(length, Math.max(0, this.size - offset));
    const result = new Uint8Array(requested);
    let read = 0;
    while (read < requested) {
      const resultRead = await this.file.read(
        result,
        read,
        requested - read,
        offset + read,
      );
      if (resultRead.bytesRead === 0) {
        break;
      }
      read += resultRead.bytesRead;
    }
    return result.subarray(0, read);
    //#endregion
  }
  //#endregion
}

class R2ZipRangeReader extends Reader<undefined> {
  constructor(
    private readonly bucket: R2Bucket,
    private readonly key: string,
    size: number,
  ) {
    super(undefined);
    this.size = size;
  }

  //#region methods / read uint8 array
  override async readUint8Array(
    offset: number,
    length: number,
  ): Promise<Uint8Array> {
    if (
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      !Number.isSafeInteger(length) ||
      length < 0
    ) {
      throw new Error('Invalid ZIP file range.');
    }
    const requested = Math.min(length, Math.max(0, this.size - offset));
    const object = await this.bucket.get(this.key, {
      range: { offset, length: requested },
    });
    if (!object) {
      throw new Error(`ZIP import source "${this.key}" disappeared.`);
    }
    const data = new Uint8Array(requested);
    const reader = object.body.getReader();
    let read = 0;
    try {
      while (read < requested) {
        const result = await reader.read();
        if (result.done) {
          break;
        }
        data.set(result.value.subarray(0, requested - read), read);
        read += Math.min(result.value.byteLength, requested - read);
      }
    } finally {
      reader.releaseLock();
    }
    return data.subarray(0, read);
  }
  //#endregion
}

class RawMigrationCancelledError extends Error {
  constructor() {
    super('Raw migration snapshot creation was stopped.');
    this.name = 'RawMigrationCancelledError';
  }
}
//#endregion

@TaonRepository({
  className: 'TaonSudoRawMigrationRepository',
})
export class TaonSudoRawMigrationRepository extends TaonBaseCustomRepository {
  //#region methods / list snapshots
  listSnapshots(
    context: EndpointContext,
  ): Promise<TaonSudoRawMigrationSummary[]> {
    //#region @backendFunc
    return this.listSnapshotsBackend(context);
    //#endregion
  }
  //#endregion

  //#region methods / create snapshot
  createSnapshot(
    context: EndpointContext,
    name: string,
    options: SnapshotOptions,
  ): Promise<string> {
    //#region @backendFunc
    return this.createSnapshotBackend(context, name, options);
    //#endregion
  }
  //#endregion

  //#region methods / delete snapshot
  deleteSnapshot(context: EndpointContext, snapshotId: string): Promise<void> {
    //#region @backendFunc
    return this.deleteSnapshotBackend(context, snapshotId);
    //#endregion
  }
  //#endregion

  //#region methods / restore snapshot
  restoreSnapshot(
    context: EndpointContext,
    snapshotId: string,
    options: RestoreOptions,
  ): Promise<void> {
    //#region @backendFunc
    return this.restoreSnapshotBackend(context, snapshotId, options);
    //#endregion
  }
  //#endregion

  //#region methods / export snapshot
  exportSnapshot(
    context: EndpointContext,
    snapshotId: string,
  ): Promise<ReadableStream<Uint8Array>> {
    //#region @backendFunc
    return this.exportSnapshotBackend(context, snapshotId);
    //#endregion
  }
  //#endregion

  //#region methods / import snapshot
  importSnapshot(
    context: EndpointContext,
    file: TaonUploadedFile,
    name: string,
  ): Promise<TaonSudoRawMigrationSummary> {
    //#region @backendFunc
    return this.importSnapshotBackend(context, file, name);
    //#endregion
  }
  //#endregion

  //#region methods / list snapshots backend
  private async listSnapshotsBackend(
    context: EndpointContext,
  ): Promise<TaonSudoRawMigrationSummary[]> {
    const prefix = this.contextPrefix(context);
    const ids: string[] = [];

    if (this.isR2Runtime()) {
      const bucket = this.getR2Bucket(context);
      let cursor: string | undefined;
      do {
        const result = await bucket.list({
          prefix,
          delimiter: '/',
          cursor,
          limit: 1000,
        });
        ids.push(
          ...(result.delimitedPrefixes || [])
            .map(item => item.slice(prefix.length).replace(/\/$/, ''))
            .filter(id => this.isSnapshotId(id)),
        );
        cursor = result.truncated ? result.cursor : undefined;
      } while (cursor);
    } else {
      const dir = this.localContextDirectory(context);
      let entries: Dirent[];
      try {
        entries = await fse.readdir(dir, { withFileTypes: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return [];
        }
        throw error;
      }
      ids.push(
        ...entries
          .filter(entry => entry.isDirectory() && this.isSnapshotId(entry.name))
          .map(entry => entry.name),
      );
    }

    const summaries: TaonSudoRawMigrationSummary[] = [];
    const metadata = await this.snapshotMetadataRepository(context).find({
      where: { contextName: context.contextName },
    });
    const metadataById = new Map(metadata.map(item => [item.snapshotId, item]));
    for (const id of [...new Set(ids)]) {
      const manifest = await this.readManifest(context, id);
      if (manifest) {
        this.assertManifest(manifest, context.contextName);
        if (manifest.id !== id) {
          throw new Error(
            `Snapshot metadata does not match its storage identifier "${id}".`,
          );
        }
        summaries.push({
          id: manifest.id,
          contextName: manifest.contextName,
          name: metadataById.get(manifest.id)?.name || manifest.name,
          createdAt: manifest.createdAt,
          totalBytes: manifest.totalBytes,
          totalFiles: manifest.totalFiles,
        });
      }
    }
    return summaries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  //#endregion

  //#region methods / create snapshot backend
  private async createSnapshotBackend(
    context: EndpointContext,
    name: string,
    options: SnapshotOptions,
  ): Promise<string> {
    this.requireSqlConnection(context);
    const snapshotName = this.validateSnapshotName(name);
    const id = crypto.randomUUID();
    const stageId = `staging-${id}`;
    const stagePrefix = this.snapshotPrefix(context, stageId);
    const sqlEntities: TaonSudoRawMigrationEntity[] = [];
    const bucketControllers: TaonSudoRawMigrationBucketController[] = [];
    let totalBytes = 0;
    let totalFiles = 0;
    let completed = 0;
    const assertNotCancelled = () => {
      if (options.isCancelled()) {
        throw new RawMigrationCancelledError();
      }
    };

    try {
      const entityMetadatas = context.connection!.entityMetadatas.filter(item =>
        TaonSudoUtils.isRawMigrationSqlEntityIncluded(
          item.name,
          item.tableName,
        ),
      );
      const entityTables = new Set<string>();
      for (const metadata of entityMetadatas) {
        if (entityTables.has(metadata.tableName)) {
          throw new Error(
            `SQL table "${metadata.tableName}" is mapped by multiple entities; raw migration staging cannot represent it safely.`,
          );
        }
        entityTables.add(metadata.tableName);
      }
      const controllers = this.getIncludedBucketControllers(context);
      const listedControllers: {
        name: string;
        controller: TaonBaseStorageController;
        files: TaonStorageObject[];
      }[] = [];
      for (const item of controllers) {
        const instance = context.getInstanceBy(item.classFn as any) as
          | TaonBaseStorageController
          | undefined;
        if (!instance) {
          throw new Error(
            `Storage controller "${item.name}" could not be initialized in context "${context.contextName}".`,
          );
        }
        const files = await this.listBucketFiles(instance);
        listedControllers.push({
          name: item.name,
          controller: instance,
          files,
        });
      }

      const expectedTasks =
        entityMetadatas.length +
        listedControllers.reduce((sum, item) => sum + item.files.length, 0);
      options.onProgress({
        phase: 'Staging SQL tables and bucket objects',
        completed,
        total: expectedTasks,
      });

      const queryRunner = context.connection!.createQueryRunner();
      try {
        await queryRunner.connect();
        await queryRunner.startTransaction();
        for (let index = 0; index < entityMetadatas.length; index++) {
          assertNotCancelled();
          const metadata = entityMetadatas[index];
          // const classFn = context.getClassFunByClassName(metadata.name);
          // if (!classFn) {
          //   throw new Error(
          //     `SQL entity "${metadata.name}" is not registered in context "${context.contextName}".`,
          //   );
          // }
          const repository = queryRunner.manager.getRepository(metadata.target);
          const columns = repository.metadata.columns.filter(
            column => !column.isVirtual && !column.isVirtualProperty,
          );
          const primaryColumns = repository.metadata.primaryColumns;
          if (!primaryColumns.length) {
            throw new Error(
              `SQL table "${metadata.tableName}" has no primary key; stable raw migration staging is not available.`,
            );
          }
          const file = `sql/${index}.jsonl`;
          const rowsRepository = repository as Repository<
            Record<string, unknown>
          >;
          let offset = 0;
          const order = Object.fromEntries(
            primaryColumns.map(column => [column.propertyPath, 'ASC']),
          );
          await this.writeObject(context, stagePrefix + file, async write => {
            while (true) {
              assertNotCancelled();
              const entities = await rowsRepository.find({
                skip: offset,
                take: ROW_BATCH_SIZE,
                order,
                loadEagerRelations: false,
              });
              if (entities.length === 0) {
                break;
              }
              for (const entity of entities) {
                const row: Record<string, unknown> = {};
                for (const column of columns) {
                  row[column.propertyPath] = column.getEntityValue(entity);
                }
                const line = `${JSON.stringify(encodeRawValue(row))}\n`;
                const encodedLine = new TextEncoder().encode(line);
                await write(encodedLine);
                totalBytes += encodedLine.byteLength;
              }
              offset += entities.length;
              if (entities.length < ROW_BATCH_SIZE) {
                break;
              }
            }
          });
          totalFiles++;
          sqlEntities.push({
            name: metadata.name,
            tableName: metadata.tableName,
            columns: columns.map(column => column.propertyPath),
            file,
          });
          completed++;
          options.onProgress({
            phase: `Staged SQL table ${metadata.name}`,
            completed,
            total: expectedTasks,
          });
        }
        await queryRunner.commitTransaction();
      } catch (error) {
        if (queryRunner.isTransactionActive) {
          await queryRunner.rollbackTransaction();
        }
        throw error;
      } finally {
        await queryRunner.release();
      }

      for (
        let controllerIndex = 0;
        controllerIndex < listedControllers.length;
        controllerIndex++
      ) {
        const listed = listedControllers[controllerIndex];
        const files: TaonSudoRawMigrationFile[] = [];
        for (let fileIndex = 0; fileIndex < listed.files.length; fileIndex++) {
          assertNotCancelled();
          const object = listed.files[fileIndex];
          this.assertSafeStorageKey(object.key);
          const file = `bucket/${controllerIndex}/${fileIndex}.bin`;
          const source = await this.openBucketObject(
            context,
            listed.name,
            object.key,
          );
          let streamedBytes = 0;
          await this.writeObject(context, stagePrefix + file, async write => {
            const reader = source.getReader();
            try {
              while (true) {
                assertNotCancelled();
                const result = await reader.read();
                if (result.done) {
                  break;
                }
                await write(result.value);
                totalBytes += result.value.byteLength;
                streamedBytes += result.value.byteLength;
              }
            } finally {
              reader.releaseLock();
            }
          });
          if (streamedBytes !== object.size) {
            throw new Error(
              `Bucket object "${listed.name}/${object.key}" changed while it was being staged.`,
            );
          }
          totalFiles++;
          files.push({
            file,
            key: object.key,
            size: object.size,
            contentType: object.contentType,
            fileName: object.fileName,
            metadata: object.metadata,
          });
          completed++;
          options.onProgress({
            phase: `Staged ${listed.name}/${object.key}`,
            completed,
            total: expectedTasks,
          });
        }
        bucketControllers.push({ name: listed.name, files });
      }

      assertNotCancelled();
      if (
        !Number.isSafeInteger(totalBytes) ||
        !Number.isSafeInteger(totalFiles)
      ) {
        throw new Error(
          'Raw migration snapshot size totals exceed safe limits.',
        );
      }
      const manifest: TaonSudoRawMigrationManifest = {
        format: SNAPSHOT_FORMAT,
        version: 2,
        id,
        contextName: context.contextName,
        name: snapshotName,
        createdAt: new Date().toISOString(),
        sqlEntities,
        bucketControllers,
        totalBytes,
        totalFiles,
      };
      await this.writeObject(
        context,
        stagePrefix + 'manifest.json',
        async write => {
          await write(
            new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
          );
        },
      );
      await this.commitStage(context, stageId, id);
      try {
        await this.storeSnapshotMetadata(context, {
          snapshotId: id,
          contextName: context.contextName,
          name: snapshotName,
          createdAt: manifest.createdAt,
          totalBytes,
          totalFiles,
        });
      } catch (error) {
        const cleanupErrors: unknown[] = [];
        try {
          await this.deletePrefix(context, this.snapshotPrefix(context, id));
        } catch (cleanupError) {
          cleanupErrors.push(cleanupError);
        }
        try {
          await this.deleteSnapshotMetadata(context, id);
        } catch (cleanupError) {
          cleanupErrors.push(cleanupError);
        }
        if (cleanupErrors.length) {
          throw new AggregateError(
            [error, ...cleanupErrors],
            'Snapshot metadata could not be saved and snapshot cleanup was incomplete.',
          );
        }
        throw error;
      }
      return id;
    } catch (error) {
      try {
        await this.deletePrefix(context, stagePrefix);
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          'Raw migration snapshot creation failed and staging cleanup also failed.',
        );
      }
      throw error;
    }
  }
  //#endregion

  //#region methods / delete snapshot backend
  private async deleteSnapshotBackend(
    context: EndpointContext,
    snapshotId: string,
  ): Promise<void> {
    this.assertSnapshotId(snapshotId);
    const manifest = await this.readManifest(context, snapshotId);
    if (!manifest) {
      throw new Error(`Raw migration snapshot "${snapshotId}" was not found.`);
    }
    this.assertManifest(manifest, context.contextName);
    if (manifest.id !== snapshotId) {
      throw new Error(
        'Snapshot metadata does not match its storage identifier.',
      );
    }
    const metadataRepository = this.snapshotMetadataRepository(context);
    const metadata = await metadataRepository.find({
      where: { contextName: context.contextName, snapshotId },
    });
    if (metadata.length) {
      await metadataRepository.remove(metadata);
    }
    try {
      await this.deletePrefix(
        context,
        this.snapshotPrefix(context, snapshotId),
      );
    } catch (error) {
      if (metadata.length) {
        try {
          await metadataRepository.save(metadata);
        } catch (metadataError) {
          throw new AggregateError(
            [error, metadataError],
            'Snapshot storage deletion failed and metadata restoration also failed.',
          );
        }
      }
      throw error;
    }
  }
  //#endregion

  //#region methods / export snapshot backend
  private async exportSnapshotBackend(
    context: EndpointContext,
    snapshotId: string,
  ): Promise<ReadableStream<Uint8Array>> {
    this.assertSnapshotId(snapshotId);
    const manifest = await this.readManifest(context, snapshotId);
    if (!manifest) {
      throw new Error(`Raw migration snapshot "${snapshotId}" was not found.`);
    }
    this.assertManifest(manifest, context.contextName);
    let readableController:
      | TransformStreamDefaultController<Uint8Array>
      | undefined;
    const transform = new TransformStream<Uint8Array, Uint8Array>({
      start(controller) {
        readableController = controller;
      },
    });
    const writer = new ZipWriter(transform.writable, {
      level: 0,
      useWebWorkers: false,
    });
    void (async () => {
      try {
        await writer.add(
          'manifest.json',
          new TextReader(JSON.stringify(manifest, null, 2)),
        );
        const prefix = this.snapshotPrefix(context, snapshotId);
        for (const entity of manifest.sqlEntities) {
          await writer.add(
            entity.file,
            await this.openObject(context, prefix + entity.file),
          );
        }
        for (const controller of manifest.bucketControllers) {
          for (const file of controller.files) {
            await writer.add(
              file.file,
              await this.openObject(context, prefix + file.file),
            );
          }
        }
        await writer.close();
      } catch (error) {
        readableController?.error(error);
      }
    })();
    return transform.readable;
  }
  //#endregion

  //#region methods / import snapshot backend
  private async importSnapshotBackend(
    context: EndpointContext,
    file: TaonUploadedFile,
    name: string,
  ): Promise<TaonSudoRawMigrationSummary> {
    //#region @backendFunc
    const snapshotName = this.validateSnapshotName(name);
    let zipReader: ZipReader<unknown> | undefined;
    let fileHandle: FileHandle | undefined;
    const temporaryBucket = this.isR2Runtime()
      ? (GlobalStorage.get('TAON_TEMP_STORAGE') as R2Bucket | undefined)
      : undefined;
    let operationError: unknown;
    if (this.isR2Runtime() && !temporaryBucket) {
      throw new Error(
        'Taon temporary R2 storage is not configured for ZIP import.',
      );
    }

    try {
      let reader: Reader<undefined>;
      if (this.isR2Runtime()) {
        const info = await temporaryBucket!.head(file.tempKeyOrPath);
        if (!info) {
          throw new Error('Uploaded raw migration ZIP was not found.');
        }
        reader = new R2ZipRangeReader(
          temporaryBucket!,
          file.tempKeyOrPath,
          info.size,
        );
      } else {
        const info = await fse.stat(file.tempKeyOrPath);
        // @ts-ignore
        fileHandle = await open(file.tempKeyOrPath, 'r');
        reader = new LocalZipRangeReader(fileHandle, info.size);
      }

      zipReader = new ZipReader(reader, { useWebWorkers: false });
      const entries = await zipReader.getEntries();
      const manifestEntry = entries.find(
        (entry): entry is FileEntry =>
          !entry.directory && entry.filename === 'manifest.json',
      );
      if (!manifestEntry || manifestEntry.uncompressedSize > 10 * 1024 * 1024) {
        throw new Error('ZIP does not contain a valid raw migration manifest.');
      }
      const manifestContent = await manifestEntry.getData(new TextWriter());
      const manifest = this.parseManifest(manifestContent, 'manifest.json');
      this.assertManifest(manifest);

      const expectedFiles = new Set<string>(['manifest.json']);
      for (const entity of manifest.sqlEntities) {
        expectedFiles.add(entity.file);
      }
      for (const controller of manifest.bucketControllers) {
        for (const bucketFile of controller.files) {
          expectedFiles.add(bucketFile.file);
        }
      }
      const archiveFiles = entries.filter(
        (entry): entry is FileEntry => !entry.directory,
      );
      if (
        archiveFiles.length !== entries.length ||
        archiveFiles.length !== expectedFiles.size ||
        new Set(archiveFiles.map(entry => entry.filename)).size !==
          archiveFiles.length ||
        archiveFiles.some(entry => !expectedFiles.has(entry.filename))
      ) {
        throw new Error(
          'ZIP contents do not match the raw migration manifest.',
        );
      }
      const dataFiles = archiveFiles.filter(
        entry => entry.filename !== 'manifest.json',
      );
      const importedBytes = dataFiles.reduce(
        (total, entry) => total + entry.uncompressedSize,
        0,
      );
      const expectedDataFiles =
        manifest.sqlEntities.length +
        manifest.bucketControllers.reduce(
          (total, controller) => total + controller.files.length,
          0,
        );
      if (
        !Number.isSafeInteger(importedBytes) ||
        importedBytes !== manifest.totalBytes ||
        dataFiles.length !== expectedDataFiles ||
        expectedDataFiles !== manifest.totalFiles
      ) {
        throw new Error(
          'ZIP contents do not match the raw migration manifest totals.',
        );
      }

      const id = crypto.randomUUID();
      const stageId = `staging-${id}`;
      const stagePrefix = this.snapshotPrefix(context, stageId);
      const entryByName = new Map(
        archiveFiles.map(entry => [entry.filename, entry]),
      );
      try {
        for (const entity of manifest.sqlEntities) {
          await this.writeZipEntry(
            context,
            stagePrefix + entity.file,
            entryByName.get(entity.file)!,
          );
        }
        for (const controller of manifest.bucketControllers) {
          for (const bucketFile of controller.files) {
            const archiveEntry = entryByName.get(bucketFile.file);
            if (
              !archiveEntry ||
              archiveEntry.uncompressedSize !== bucketFile.size
            ) {
              throw new Error(
                `ZIP entry "${bucketFile.file}" has an unexpected size.`,
              );
            }
            await this.writeZipEntry(
              context,
              stagePrefix + bucketFile.file,
              archiveEntry,
            );
          }
        }
        const importedManifest: TaonSudoRawMigrationManifest = {
          ...manifest,
          version: 2,
          id,
          contextName: context.contextName,
          name: snapshotName,
          createdAt: new Date().toISOString(),
        };
        await this.writeObject(
          context,
          stagePrefix + 'manifest.json',
          async write => {
            await write(
              new TextEncoder().encode(
                JSON.stringify(importedManifest, null, 2),
              ),
            );
          },
        );
        await this.commitStage(context, stageId, id);
        try {
          await this.storeSnapshotMetadata(context, {
            snapshotId: id,
            contextName: context.contextName,
            name: snapshotName,
            createdAt: importedManifest.createdAt,
            totalBytes: importedManifest.totalBytes,
            totalFiles: importedManifest.totalFiles,
          });
        } catch (error) {
          const cleanupErrors: unknown[] = [];
          try {
            await this.deletePrefix(context, this.snapshotPrefix(context, id));
          } catch (cleanupError) {
            cleanupErrors.push(cleanupError);
          }
          try {
            await this.deleteSnapshotMetadata(context, id);
          } catch (cleanupError) {
            cleanupErrors.push(cleanupError);
          }
          if (cleanupErrors.length) {
            throw new AggregateError(
              [error, ...cleanupErrors],
              'Imported snapshot metadata could not be saved and cleanup was incomplete.',
            );
          }
          throw error;
        }
        return {
          id,
          contextName: context.contextName,
          name: snapshotName,
          createdAt: importedManifest.createdAt,
          totalBytes: importedManifest.totalBytes,
          totalFiles: importedManifest.totalFiles,
        };
      } catch (error) {
        try {
          await this.deletePrefix(context, stagePrefix);
        } catch (cleanupError) {
          throw new AggregateError(
            [error, cleanupError],
            'Raw migration ZIP import failed and staging cleanup also failed.',
          );
        }
        throw error;
      }
    } catch (error) {
      operationError = error;
      throw error;
    } finally {
      const cleanupErrors: unknown[] = [];
      try {
        await zipReader?.close();
      } catch (error) {
        cleanupErrors.push(error);
      }
      try {
        await fileHandle?.close();
      } catch (error) {
        cleanupErrors.push(error);
      }
      try {
        if (temporaryBucket) {
          await temporaryBucket.delete(file.tempKeyOrPath);
        } else {
          await fse.remove(file.tempKeyOrPath);
        }
      } catch (error) {
        cleanupErrors.push(error);
      }
      if (cleanupErrors.length) {
        if (operationError) {
          throw new AggregateError(
            [operationError, ...cleanupErrors],
            'Raw migration ZIP import failed and temporary-file cleanup was incomplete.',
          );
        }
        throw new AggregateError(
          cleanupErrors,
          'Raw migration ZIP import completed, but temporary-file cleanup was incomplete.',
        );
      }
    }
    //#endregion
  }
  //#endregion

  //#region methods / write zip entry
  private async writeZipEntry(
    context: EndpointContext,
    destinationKey: string,
    entry: FileEntry,
  ): Promise<void> {
    //#region @backendFunc
    //#region @cjsRemove
    if (this.isR2Runtime()) {
      const transform = new TransformStream<Uint8Array, Uint8Array>();
      const upload = this.getR2Bucket(context).put(
        destinationKey,
        transform.readable as any,
      );
      try {
        await entry.getData(transform.writable);
        const result = await upload;
        if (!result) {
          throw new Error(`Could not stage ZIP entry "${entry.filename}".`);
        }
      } catch (error) {
        const cleanupErrors: unknown[] = [];
        try {
          await transform.writable.abort(error);
        } catch (cleanupError) {
          cleanupErrors.push(cleanupError);
        }
        try {
          await upload;
        } catch (cleanupError) {
          cleanupErrors.push(cleanupError);
        }
        if (cleanupErrors.length) {
          throw new AggregateError(
            [error, ...cleanupErrors],
            `ZIP entry "${entry.filename}" failed and its upload cleanup also failed.`,
          );
        }
        throw error;
      }
      return;
    }
    //#endregion
    //#region @esmRemove
    const destinationPath = this.localObjectPath(context, destinationKey);
    await fse.ensureDir(path.dirname(destinationPath));
    await entry.getData(Writable.toWeb(fse.createWriteStream(destinationPath)));
    //#endregion

    return void 0 as any;
    //#endregion
  }
  //#endregion

  //#region methods / restore snapshot backend
  private async restoreSnapshotBackend(
    context: EndpointContext,
    snapshotId: string,
    options: RestoreOptions,
  ): Promise<void> {
    const clearAllData = options.clearAllData === true;
    this.requireSqlConnection(context);
    this.assertSnapshotId(snapshotId);
    const manifest = await this.readManifest(context, snapshotId);
    if (!manifest) {
      throw new Error(`Raw migration snapshot "${snapshotId}" was not found.`);
    }
    this.assertManifest(manifest, context.contextName);
    const currentEntities = context.connection!.entityMetadatas.filter(item =>
      TaonSudoUtils.isRawMigrationSqlEntityIncluded(item.name, item.tableName),
    );
    const currentEntityNames = currentEntities.map(item => item.name).sort();
    const snapshotEntityNames = manifest.sqlEntities
      .map(item => item.name)
      .sort();
    if (
      currentEntityNames.length !== snapshotEntityNames.length ||
      currentEntityNames.some(
        (name, index) => name !== snapshotEntityNames[index],
      )
    ) {
      throw new Error(
        'The SQL schema differs from the snapshot. Restore was not started.',
      );
    }
    for (const entity of manifest.sqlEntities) {
      const metadata = currentEntities.find(item => item.name === entity.name);
      if (
        !metadata ||
        metadata.tableName !== entity.tableName ||
        metadata.columns
          .filter(column => !column.isVirtual && !column.isVirtualProperty)
          .map(column => column.propertyPath)
          .sort()
          .join('\0') !== [...entity.columns].sort().join('\0')
      ) {
        throw new Error(
          `The SQL schema for "${entity.name}" differs from the snapshot. Restore was not started.`,
        );
      }
    }

    const bucketControllers = this.getIncludedBucketControllers(context);
    const currentControllerNames = bucketControllers
      .map(item => item.name)
      .sort();
    const snapshotControllerNames = manifest.bucketControllers
      .map(item => item.name)
      .sort();
    if (
      currentControllerNames.length !== snapshotControllerNames.length ||
      currentControllerNames.some(
        (name, index) => name !== snapshotControllerNames[index],
      )
    ) {
      throw new Error(
        'The bucket controller set differs from the snapshot. Restore was not started.',
      );
    }
    for (const bucketController of manifest.bucketControllers) {
      for (const file of bucketController.files) {
        this.assertSafeStorageKey(file.key);
        await this.assertObjectExists(
          context,
          this.snapshotPrefix(context, snapshotId) + file.file,
        );
      }
    }
    for (const entity of manifest.sqlEntities) {
      await this.assertObjectExists(
        context,
        this.snapshotPrefix(context, snapshotId) + entity.file,
      );
    }

    const orderedEntities = this.orderEntitiesForRestore(
      currentEntities,
      manifest.sqlEntities,
    );
    const backupPrefix = this.snapshotPrefix(
      context,
      `rollback-${options.jobId}`,
    );
    const backups: BucketBackup[] = [];
    const queryRunner = context.connection!.createQueryRunner();
    let bucketChangesStarted = false;
    let preserveBackups = false;
    let operationError: unknown;

    try {
      options.onProgress({
        phase: 'Staging current bucket objects for rollback',
        completed: 0,
        total: manifest.bucketControllers.length,
      });
      for (const [index, item] of bucketControllers.entries()) {
        const classFn = context.getClassFunByClassName(item.name);
        const controller = classFn
          ? (context.getInstanceBy(classFn as any) as
              | TaonBaseStorageController
              | undefined)
          : undefined;
        if (!controller) {
          continue;
          // throw new Error(`Storage controller "${item.name}" is unavailable.`);
        }
        const files = await this.listBucketFiles(controller);
        backups.push({ controllerName: item.name, files });

        for (const [fileIndex, file] of files.entries()) {
          const source = await this.openBucketObject(
            context,
            item.name,
            file.key,
          );
          let backupBytes = 0;
          await this.writeObject(
            context,
            `${backupPrefix}bucket/${index}/${fileIndex}.bin`,
            async write => {
              const reader = source.getReader();
              try {
                while (true) {
                  const result = await reader.read();
                  if (result.done) {
                    break;
                  }
                  await write(result.value);
                  backupBytes += result.value.byteLength;
                }
              } finally {
                reader.releaseLock();
              }
            },
          );
          if (backupBytes !== file.size) {
            throw new Error(
              `Bucket object "${item.name}/${file.key}" changed while rollback data was being staged.`,
            );
          }
        }
        options.onProgress({
          phase: `Staged current bucket ${item.name}`,
          completed: index + 1,
          total: manifest.bucketControllers.length,
        });
      }

      await queryRunner.connect();
      await queryRunner.startTransaction();
      const repositoryByName = new Map<
        string,
        Repository<Record<string, unknown>>
      >();

      for (const entity of orderedEntities) {
        const classFn = context.getClassFunByClassName(entity.name);
        if (!classFn) {
          continue;
          // throw new Error(`SQL entity "${entity.name}" is unavailable.`);
        }
        repositoryByName.set(
          entity.name,
          queryRunner.manager.getRepository(entity.name) as Repository<
            Record<string, unknown>
          >,
        );
      }

      if (clearAllData) {
        for (const entity of [...orderedEntities].reverse()) {
          options.onProgress({
            phase: `Clearing SQL table ${entity.name}`,
          });
          await repositoryByName
            .get(entity.name)!
            .createQueryBuilder()
            .delete()
            .execute();
        }

        bucketChangesStarted = true;
        for (const bucketController of bucketControllers) {
          const controller = this.getStorageController(
            context,
            bucketController.name,
          );
          const existing = await this.listBucketFiles(controller);
          for (const file of existing) {
            const deleted = await controller.delete(file.key)();
            if (!deleted) {
              throw new Error(
                `Could not clear bucket data; "${bucketController.name}/${file.key}" disappeared.`,
              );
            }
          }
          options.onProgress({
            phase: `Cleared bucket ${bucketController.name}`,
          });
        }
      }
      for (const [index, entity] of orderedEntities.entries()) {
        options.onProgress({
          phase: `${clearAllData ? 'Restoring' : 'Overlaying'} SQL table ${entity.name}`,
          completed: index,
          total: orderedEntities.length + manifest.bucketControllers.length,
        });
        await this.restoreRows(
          context,
          this.snapshotPrefix(context, snapshotId) + entity.file,
          entity,
          repositoryByName.get(entity.name)!,
          clearAllData,
        );
      }

      if (!clearAllData) {
        bucketChangesStarted = true;
      }
      for (const [
        index,
        bucketController,
      ] of manifest.bucketControllers.entries()) {
        for (const file of bucketController.files) {
          await this.restoreBucketFile(
            context,
            bucketController.name,
            this.snapshotPrefix(context, snapshotId) + file.file,
            file,
          );
        }
        options.onProgress({
          phase: `${clearAllData ? 'Restored' : 'Overlayed'} bucket ${bucketController.name}`,
          completed: orderedEntities.length + index + 1,
          total: orderedEntities.length + manifest.bucketControllers.length,
        });
      }
      await queryRunner.commitTransaction();
    } catch (error) {
      operationError = error;
      const failures: unknown[] = [error];
      if (queryRunner.isTransactionActive) {
        try {
          await queryRunner.rollbackTransaction();
        } catch (rollbackError) {
          failures.push(rollbackError);
        }
      }
      if (bucketChangesStarted) {
        try {
          await this.restoreBucketBackups(
            context,
            backups,
            backupPrefix,
            clearAllData,
          );
        } catch (rollbackError) {
          preserveBackups = true;
          failures.push(rollbackError);
        }
      }
      if (failures.length > 1) {
        operationError = new AggregateError(
          failures,
          preserveBackups
            ? `Raw migration restore failed; rollback encountered additional errors. Rollback data was retained at "${backupPrefix}".`
            : 'Raw migration restore failed; rollback encountered additional errors.',
        );
      }
      throw operationError;
    } finally {
      const cleanupErrors: unknown[] = [];
      try {
        await queryRunner.release();
      } catch (error) {
        cleanupErrors.push(error);
      }
      if (!preserveBackups) {
        try {
          await this.deletePrefix(context, backupPrefix);
        } catch (error) {
          cleanupErrors.push(error);
        }
      }
      if (operationError) {
        options.onProgress({
          phase: 'Restore failed; changes were rolled back where possible',
        });
      }
      if (cleanupErrors.length) {
        if (operationError) {
          throw new AggregateError(
            [operationError, ...cleanupErrors],
            'Raw migration restore failed and cleanup was incomplete.',
          );
        }
        throw new AggregateError(
          cleanupErrors,
          'Raw migration restore succeeded, but cleanup was incomplete.',
        );
      }
    }
    options.onProgress({
      phase: 'Restore completed',
      completed: orderedEntities.length + manifest.bucketControllers.length,
      total: orderedEntities.length + manifest.bucketControllers.length,
    });
  }
  //#endregion

  //#region methods / restore rows
  private async restoreRows(
    context: EndpointContext,
    storageKey: string,
    entity: TaonSudoRawMigrationEntity,
    repository: Repository<Record<string, unknown>>,
    clearAllData: boolean,
  ): Promise<void> {
    const allowedColumns = new Set(entity.columns);
    let batch: Record<string, unknown>[] = [];
    await this.forEachLine(context, storageKey, async line => {
      if (!line.trim()) {
        return;
      }
      const parsed: unknown = JSON.parse(line);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(`Invalid row data in snapshot table "${entity.name}".`);
      }
      const row: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (!allowedColumns.has(key)) {
          throw new Error(
            `Unexpected column "${key}" in snapshot table "${entity.name}".`,
          );
        }
        const column = repository.metadata.findColumnWithPropertyPath(key);
        if (!column) {
          throw new Error(
            `Unknown column path "${key}" in snapshot table "${entity.name}".`,
          );
        }
        column.setEntityValue(row, decodeRawValue(value));
      }
      batch.push(row);
      if (batch.length >= ROW_BATCH_SIZE) {
        if (clearAllData) {
          await repository.insert(batch);
        } else {
          await repository.save(batch);
        }
        batch = [];
      }
    });
    if (batch.length) {
      if (clearAllData) {
        await repository.insert(batch);
      } else {
        await repository.save(batch);
      }
    }
  }
  //#endregion

  //#region methods / restore bucket file
  private async restoreBucketFile(
    context: EndpointContext,
    controllerName: string,
    objectKey: string,
    file: TaonSudoRawMigrationFile,
  ): Promise<void> {
    //#region @backendFunc
    const source = await this.openObject(context, objectKey);
    //#region @cjsRemove
    if (this.isR2Runtime()) {
      const bucket = this.getR2Bucket(context);
      const result = await bucket.put(
        this.bucketObjectKey(controllerName, file.key),
        source as any,
        {
          httpMetadata: { contentType: file.contentType },
          customMetadata: {
            ...(file.metadata || {}),
            ...(file.fileName ? { fileName: file.fileName } : {}),
          },
        },
      );
      if (!result) {
        throw new Error(
          `Failed to restore bucket object "${controllerName}/${file.key}".`,
        );
      }
      if (result.size !== file.size) {
        throw new Error(
          `Restored bucket object "${controllerName}/${file.key}" has an unexpected size.`,
        );
      }
      return;
    }
    //#endregion
    //#region @esmRemove
    const destination = this.localBucketObjectPath(
      context,
      controllerName,
      file.key,
    );
    await fse.ensureDir(path.dirname(destination));
    await pipeline(
      Readable.fromWeb(source as any),
      fse.createWriteStream(destination),
    );
    const stat = await fse.stat(destination);
    if (stat.size !== file.size) {
      throw new Error(
        `Restored bucket object "${controllerName}/${file.key}" has an unexpected size.`,
      );
    }
    await fse.writeFile(
      `${destination}.taon-meta.json`,
      JSON.stringify({
        fileName: file.fileName,
        contentType: file.contentType,
        metadata: file.metadata,
      }),
      'utf8',
    );
    //#endregion

    return void 0 as any;
    //#endregion
  }
  //#endregion

  //#region methods / restore bucket backups
  private async restoreBucketBackups(
    context: EndpointContext,
    backups: BucketBackup[],
    backupPrefix: string,
    clearAllData: boolean,
  ): Promise<void> {
    for (const backup of backups) {
      const controller = this.getStorageController(
        context,
        backup.controllerName,
      );
      const current = await this.listBucketFiles(controller);
      const originalKeys = new Set(backup.files.map(file => file.key));
      for (const file of current) {
        if (!clearAllData && originalKeys.has(file.key)) {
          continue;
        }
        const deleted = await controller.delete(file.key)();
        if (!deleted) {
          throw new Error(
            `Could not restore bucket backup; "${backup.controllerName}/${file.key}" disappeared.`,
          );
        }
      }
      for (const [index, file] of backup.files.entries()) {
        await this.restoreBucketFile(
          context,
          backup.controllerName,
          `${backupPrefix}bucket/${backups.indexOf(backup)}/${index}.bin`,
          {
            file: `bucket/${backups.indexOf(backup)}/${index}.bin`,
            key: file.key,
            size: file.size,
            contentType: file.contentType,
            fileName: file.fileName,
            metadata: file.metadata,
          },
        );
      }
    }
  }
  //#endregion

  //#region methods / commit stage
  private async commitStage(
    context: EndpointContext,
    stageId: string,
    snapshotId: string,
  ): Promise<void> {
    const stagePrefix = this.snapshotPrefix(context, stageId);
    const finalPrefix = this.snapshotPrefix(context, snapshotId);
    if (!this.isR2Runtime()) {
      await fse.ensureDir(
        path.dirname(this.localSnapshotDirectory(context, snapshotId)),
      );
      await fse.move(
        this.localSnapshotDirectory(context, stageId),
        this.localSnapshotDirectory(context, snapshotId),
        { overwrite: false },
      );
      return;
    }

    const bucket = this.getR2Bucket(context);
    try {
      const stagedObjects = await this.listR2Keys(bucket, stagePrefix);
      const ordered = stagedObjects.sort((a, b) => {
        if (a.endsWith('manifest.json')) return 1;
        if (b.endsWith('manifest.json')) return -1;
        return a.localeCompare(b);
      });
      for (const key of ordered) {
        const source = await bucket.get(key);
        if (!source) {
          throw new Error(`Staged snapshot object disappeared: "${key}".`);
        }
        const destinationKey = finalPrefix + key.slice(stagePrefix.length);
        const result = await bucket.put(destinationKey, source.body as any);
        if (!result) {
          throw new Error(`Could not commit staged snapshot object "${key}".`);
        }
      }
      await this.deletePrefix(context, stagePrefix);
    } catch (error) {
      try {
        await this.deletePrefix(context, finalPrefix);
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          'Raw migration snapshot commit failed and final-stage cleanup also failed.',
        );
      }
      throw error;
    }
  }
  //#endregion

  //#region methods / read manifest
  private async readManifest(
    context: EndpointContext,
    snapshotId: string,
  ): Promise<TaonSudoRawMigrationManifest | undefined> {
    this.assertSnapshotId(snapshotId);
    const manifestKey =
      this.snapshotPrefix(context, snapshotId) + 'manifest.json';
    if (this.isR2Runtime()) {
      const object = await this.getR2Bucket(context).get(manifestKey);
      if (!object) {
        return undefined;
      }
      return this.parseManifest(await object.text(), manifestKey);
    }
    try {
      const content = await fse.readFile(
        this.localSnapshotObjectPath(context, snapshotId, 'manifest.json'),
        'utf8',
      );
      return this.parseManifest(content, manifestKey);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return undefined;
      }
      throw error;
    }
  }
  //#endregion

  //#region methods / parse manifest
  private parseManifest(
    content: string,
    manifestKey: string,
  ): TaonSudoRawMigrationManifest {
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      throw new Error(`Invalid raw migration manifest "${manifestKey}".`, {
        cause: error,
      });
    }
    if (!this.isManifest(parsed)) {
      throw new Error(`Invalid raw migration manifest "${manifestKey}".`);
    }
    if (parsed.version === 1) {
      return {
        ...parsed,
        version: 2,
        name:
          typeof parsed.name === 'string' && parsed.name.trim()
            ? parsed.name.trim()
            : `Snapshot ${parsed.id.slice(0, 8)}`,
      };
    }
    return parsed;
  }
  //#endregion

  //#region methods / assert manifest
  private assertManifest(
    manifest: TaonSudoRawMigrationManifest,
    expectedContextName?: string,
  ): void {
    if (
      manifest.format !== SNAPSHOT_FORMAT ||
      manifest.version !== 2 ||
      (expectedContextName !== undefined &&
        manifest.contextName !== expectedContextName) ||
      !this.isSnapshotId(manifest.id) ||
      !this.isValidSnapshotName(manifest.name) ||
      !Number.isFinite(Date.parse(manifest.createdAt)) ||
      !Array.isArray(manifest.sqlEntities) ||
      !Array.isArray(manifest.bucketControllers)
    ) {
      throw new Error('Snapshot manifest is invalid for this context.');
    }
    if (manifest.totalBytes < 0 || manifest.totalFiles < 0) {
      throw new Error('Snapshot manifest has invalid size totals.');
    }
    const paths = new Set<string>(['manifest.json']);
    const entityNames = new Set<string>();
    const tableNames = new Set<string>();
    for (const entity of manifest.sqlEntities) {
      if (
        !entity ||
        typeof entity.name !== 'string' ||
        !entity.name ||
        entityNames.has(entity.name) ||
        typeof entity.tableName !== 'string' ||
        !entity.tableName ||
        tableNames.has(entity.tableName) ||
        typeof entity.file !== 'string' ||
        !this.isRelativeSnapshotFile(entity.file) ||
        !Array.isArray(entity.columns) ||
        entity.columns.some(column => typeof column !== 'string') ||
        new Set(entity.columns).size !== entity.columns.length ||
        paths.has(entity.file)
      ) {
        throw new Error('Snapshot contains invalid SQL entity metadata.');
      }
      entityNames.add(entity.name);
      tableNames.add(entity.tableName);
      paths.add(entity.file);
      if (
        !TaonSudoUtils.isRawMigrationSqlEntityIncluded(
          entity.name,
          entity.tableName,
        )
      ) {
        throw new Error(
          `Snapshot SQL entity "${entity.name}" is excluded from raw migrations.`,
        );
      }
    }
    const controllerNames = new Set<string>();
    for (const controller of manifest.bucketControllers) {
      if (
        !controller ||
        typeof controller.name !== 'string' ||
        !controller.name ||
        controllerNames.has(controller.name) ||
        !TaonSudoUtils.isRawMigrationBucketControllerIncluded(
          controller.name,
        ) ||
        !Array.isArray(controller.files)
      ) {
        throw new Error(
          `Snapshot bucket controller "${controller.name}" is excluded from raw migrations.`,
        );
      }
      controllerNames.add(controller.name);
      const keys = new Set<string>();
      for (const file of controller.files) {
        if (
          !file ||
          typeof file.key !== 'string' ||
          !file.key ||
          keys.has(file.key) ||
          typeof file.file !== 'string' ||
          !this.isRelativeSnapshotFile(file.file) ||
          !Number.isSafeInteger(file.size) ||
          file.size < 0 ||
          paths.has(file.file) ||
          (file.metadata !== undefined &&
            (!file.metadata ||
              typeof file.metadata !== 'object' ||
              Array.isArray(file.metadata) ||
              Object.values(file.metadata).some(
                value => typeof value !== 'string',
              )))
        ) {
          throw new Error(
            `Snapshot contains invalid bucket file metadata for "${controller.name}".`,
          );
        }
        this.assertSafeStorageKey(file.key);
        keys.add(file.key);
        paths.add(file.file);
      }
    }
    const expectedFileCount =
      manifest.sqlEntities.length +
      manifest.bucketControllers.reduce(
        (total, controller) => total + controller.files.length,
        0,
      );
    if (manifest.totalFiles !== expectedFileCount) {
      throw new Error('Snapshot manifest has invalid file totals.');
    }
  }
  //#endregion

  //#region methods / is manifest
  private isManifest(value: unknown): value is TaonSudoRawMigrationManifest {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }
    const manifest = value as Partial<TaonSudoRawMigrationManifest>;
    return (
      manifest.format === SNAPSHOT_FORMAT &&
      (manifest.version === 1 || manifest.version === 2) &&
      typeof manifest.id === 'string' &&
      manifest.id.length > 0 &&
      typeof manifest.contextName === 'string' &&
      manifest.contextName.length > 0 &&
      (manifest.version === 1 ||
        (typeof manifest.name === 'string' &&
          this.isValidSnapshotName(manifest.name))) &&
      typeof manifest.createdAt === 'string' &&
      Number.isSafeInteger(manifest.totalBytes) &&
      (manifest.totalBytes ?? -1) >= 0 &&
      Number.isSafeInteger(manifest.totalFiles) &&
      (manifest.totalFiles ?? -1) >= 0 &&
      Array.isArray(manifest.sqlEntities) &&
      Array.isArray(manifest.bucketControllers)
    );
  }
  //#endregion

  //#region methods / write object
  private async writeObject(
    context: EndpointContext,
    key: string,
    producer: (write: (chunk: Uint8Array) => Promise<void>) => Promise<void>,
  ): Promise<void> {
    //#region @backendFunc
    let writable: WritableStream<Uint8Array>;
    let uploadPromise: Promise<unknown> | undefined;
    if (this.isR2Runtime()) {
      const transform = new TransformStream<Uint8Array, Uint8Array>();
      writable = transform.writable;
      uploadPromise = this.getR2Bucket(context).put(
        key,
        transform.readable as any,
      );
    } else {
      //#region @esmRemove
      const filePath = this.localObjectPath(context, key);
      await fse.ensureDir(path.dirname(filePath));
      writable = Writable.toWeb(
        fse.createWriteStream(filePath),
      ) as WritableStream<Uint8Array>;
      //#endregion
    }

    const writer = writable.getWriter();
    try {
      await producer(chunk => writer.write(chunk));
      await writer.close();
      if (uploadPromise && !(await uploadPromise)) {
        throw new Error(`Raw migration object "${key}" was not stored.`);
      }
    } catch (error) {
      const cleanupErrors: unknown[] = [];
      try {
        await writer.abort(error);
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
      if (uploadPromise) {
        try {
          await uploadPromise;
        } catch (cleanupError) {
          cleanupErrors.push(cleanupError);
        }
      }
      if (cleanupErrors.length) {
        throw new AggregateError(
          [error, ...cleanupErrors],
          `Raw migration object "${key}" failed and stream cleanup also failed.`,
        );
      }
      throw error;
    }
    //#endregion
  }
  //#endregion

  //#region methods / open object
  private async openObject(
    context: EndpointContext,
    key: string,
  ): Promise<ReadableStream<Uint8Array>> {
    //#region @backendFunc
    if (this.isR2Runtime()) {
      const object = await this.getR2Bucket(context).get(key);
      if (!object) {
        throw new Error(`Raw migration object "${key}" was not found.`);
      }
      return object.body as ReadableStream<Uint8Array>;
    }
    //#region @esmRemove
    return Readable.toWeb(
      fse.createReadStream(this.localObjectPath(context, key)),
    ) as ReadableStream<Uint8Array>;
    //#endregion
    return void 0 as any;
    //#endregion
  }
  //#endregion

  //#region methods / assert object exists
  private async assertObjectExists(
    context: EndpointContext,
    key: string,
  ): Promise<void> {
    if (this.isR2Runtime()) {
      const object = await this.getR2Bucket(context).head(key);
      if (!object) {
        throw new Error(`Required snapshot object is missing: "${key}".`);
      }
      return;
    }
    const stat = await fse.stat(this.localObjectPath(context, key));
    if (!stat.isFile()) {
      throw new Error(`Required snapshot object is missing: "${key}".`);
    }
  }
  //#endregion

  //#region methods / delete prefix
  private async deletePrefix(
    context: EndpointContext,
    prefix: string,
  ): Promise<void> {
    if (this.isR2Runtime()) {
      const bucket = this.getR2Bucket(context);
      const keys = await this.listR2Keys(bucket, prefix);
      for (let start = 0; start < keys.length; start += 1000) {
        await bucket.delete(keys.slice(start, start + 1000));
      }
      return;
    }
    const pathToRemove = this.localObjectPath(context, prefix);
    await fse.remove(pathToRemove);
  }
  //#endregion

  //#region methods / list r2 keys
  private async listR2Keys(
    bucket: R2Bucket,
    prefix: string,
  ): Promise<string[]> {
    const keys: string[] = [];
    let cursor: string | undefined;
    do {
      const result = await bucket.list({ prefix, cursor, limit: 1000 });
      keys.push(...result.objects.map(object => object.key));
      cursor = result.truncated ? result.cursor : undefined;
    } while (cursor);
    return keys;
  }
  //#endregion

  //#region methods / for each line
  private async forEachLine(
    context: EndpointContext,
    storageKey: string,
    processLine: (line: string) => Promise<void>,
  ): Promise<void> {
    const stream = await this.openObject(context, storageKey);
    const decoder = new TextDecoder();
    const reader = stream.getReader();
    let buffered = '';
    try {
      while (true) {
        const result = await reader.read();
        if (result.done) {
          break;
        }
        buffered += decoder.decode(result.value, { stream: true });
        const lines = buffered.split('\n');
        buffered = lines.pop() || '';
        for (const line of lines) {
          await processLine(line);
        }
      }
      buffered += decoder.decode();
      if (buffered) {
        await processLine(buffered);
      }
    } finally {
      reader.releaseLock();
    }
  }
  //#endregion

  //#region methods / open bucket object
  private async openBucketObject(
    context: EndpointContext,
    controllerName: string,
    key: string,
  ): Promise<ReadableStream<Uint8Array>> {
    //#region @backendFunc
    if (this.isR2Runtime()) {
      const object = await this.getR2Bucket(context).get(
        this.bucketObjectKey(controllerName, key),
      );
      if (!object) {
        throw new Error(
          `Bucket object "${controllerName}/${key}" disappeared.`,
        );
      }
      return object.body as ReadableStream<Uint8Array>;
    }
    //#region @esmRemove
    return Readable.toWeb(
      fse.createReadStream(
        this.localBucketObjectPath(context, controllerName, key),
      ),
    ) as ReadableStream<Uint8Array>;
    //#endregion
    return void 0 as any;
    //#endregion
  }
  //#endregion

  //#region methods / list bucket files
  private async listBucketFiles(
    controller: TaonBaseStorageController,
  ): Promise<TaonStorageObject[]> {
    const files = await controller.list({})();
    if (!Array.isArray(files)) {
      throw new Error(
        `Storage controller "${controller.constructor.name}" returned an invalid file listing.`,
      );
    }
    const keys = new Set<string>();
    for (const file of files as TaonStorageObject[]) {
      if (
        !file ||
        typeof file.key !== 'string' ||
        !Number.isSafeInteger(file.size) ||
        file.size < 0 ||
        keys.has(file.key) ||
        (file.contentType !== undefined &&
          typeof file.contentType !== 'string') ||
        (file.fileName !== undefined && typeof file.fileName !== 'string') ||
        (file.metadata !== undefined &&
          (!file.metadata ||
            typeof file.metadata !== 'object' ||
            Array.isArray(file.metadata) ||
            Object.values(file.metadata).some(
              value => typeof value !== 'string',
            )))
      ) {
        throw new Error(
          `Storage controller "${controller.constructor.name}" returned invalid or duplicate file metadata.`,
        );
      }
      this.assertSafeStorageKey(file.key);
      keys.add(file.key);
    }
    return files as TaonStorageObject[];
  }
  //#endregion

  //#region methods / get included bucket controllers
  private getIncludedBucketControllers(
    context: EndpointContext,
  ): { name: string; classFn: Function }[] {
    return context
      .getClassFunByArr(Models.ClassType.CONTROLLER)
      .map(classFn => ({
        name: ClassHelpers.getName(classFn),
        classFn,
      }))
      .filter(
        item =>
          (item.classFn === TaonBaseStorageController ||
            item.classFn.prototype instanceof TaonBaseStorageController) &&
          TaonSudoUtils.isRawMigrationBucketControllerIncluded(item.name),
      );
  }
  //#endregion

  //#region methods / get storage controller
  private getStorageController(
    context: EndpointContext,
    controllerName: string,
  ): TaonBaseStorageController {
    const controllerClass = this.getIncludedBucketControllers(context).find(
      item => item.name === controllerName,
    );
    if (!controllerClass) {
      throw new Error(
        `Storage controller "${controllerName}" is not eligible for raw migrations.`,
      );
    }
    const controller = context.getInstanceBy(controllerClass.classFn as any);
    if (!(controller instanceof TaonBaseStorageController)) {
      throw new Error(`Storage controller "${controllerName}" is unavailable.`);
    }
    return controller;
  }
  //#endregion

  //#region methods / order entities for restore
  private orderEntitiesForRestore(
    metadata: NonNullable<EndpointContext['connection']>['entityMetadatas'],
    snapshots: TaonSudoRawMigrationEntity[],
  ): TaonSudoRawMigrationEntity[] {
    const snapshotsByTable = new Map(
      snapshots.map(entity => [entity.tableName, entity]),
    );
    const pending = new Set(snapshots.map(entity => entity.tableName));
    const ordered: TaonSudoRawMigrationEntity[] = [];
    while (pending.size) {
      const next = [...pending].find(tableName => {
        const tableMetadata = metadata.find(
          item => item.tableName === tableName,
        );
        return tableMetadata?.foreignKeys.every(
          key => !pending.has(key.referencedEntityMetadata.tableName),
        );
      });
      if (!next) {
        throw new Error(
          'The SQL schema contains cyclic foreign keys; a safe raw restore cannot be staged.',
        );
      }
      pending.delete(next);
      ordered.push(snapshotsByTable.get(next)!);
    }
    return ordered;
  }
  //#endregion

  //#region methods / require sql connection
  private requireSqlConnection(context: EndpointContext): void {
    if (!context.connection) {
      throw new Error(
        `Context "${context.contextName}" does not have an initialized SQL connection.`,
      );
    }
  }
  //#endregion

  //#region methods / snapshot metadata repository
  private snapshotMetadataRepository(
    context: EndpointContext,
  ): Repository<TaonSudoSnapshotEntity> {
    this.requireSqlConnection(context);
    const entityClass = context.getClassFunByClassName(
      'TaonSudoSnapshotEntity',
    );
    if (!entityClass) {
      throw new Error(
        `TaonSudoSnapshotEntity is not registered in context "${context.contextName}".`,
      );
    }
    return context.connection!.getRepository(
      entityClass as any,
    ) as Repository<TaonSudoSnapshotEntity>;
  }
  //#endregion

  //#region methods / store snapshot metadata
  private async storeSnapshotMetadata(
    context: EndpointContext,
    metadata: Pick<
      TaonSudoSnapshotEntity,
      | 'snapshotId'
      | 'contextName'
      | 'name'
      | 'createdAt'
      | 'totalBytes'
      | 'totalFiles'
    >,
  ): Promise<void> {
    await this.snapshotMetadataRepository(context).save(metadata);
  }
  //#endregion

  //#region methods / delete snapshot metadata
  private async deleteSnapshotMetadata(
    context: EndpointContext,
    snapshotId: string,
  ): Promise<void> {
    const repository = this.snapshotMetadataRepository(context);
    const records = await repository.find({
      where: { contextName: context.contextName, snapshotId },
    });
    if (records.length) {
      await repository.remove(records);
    }
  }
  //#endregion

  //#region methods / validate snapshot name
  private validateSnapshotName(name: string): string {
    const normalized = typeof name === 'string' ? name.trim() : '';
    if (!this.isValidSnapshotName(normalized)) {
      throw new Error(
        'Snapshot name is required and must be 1-120 characters.',
      );
    }
    return normalized;
  }
  //#endregion

  //#region methods / is valid snapshot name
  private isValidSnapshotName(name: unknown): name is string {
    return (
      typeof name === 'string' &&
      name.trim().length > 0 &&
      name.trim().length <= 120
    );
  }
  //#endregion

  //#region methods / context prefix
  private contextPrefix(context: EndpointContext): string {
    return `${RAW_MIGRATION_ROOT}/${encodeURIComponent(context.contextName)}/`;
  }
  //#endregion

  //#region methods / snapshot prefix
  private snapshotPrefix(context: EndpointContext, id: string): string {
    return `${this.contextPrefix(context)}${id}/`;
  }
  //#endregion

  //#region methods / local context directory
  private localContextDirectory(context: EndpointContext): string {
    return path.join(
      context.bucketFileDbLocationBase,
      RAW_MIGRATION_ROOT,
      encodeURIComponent(context.contextName),
    );
  }
  //#endregion

  //#region methods / local snapshot directory
  private localSnapshotDirectory(context: EndpointContext, id: string): string {
    this.assertSnapshotId(id, true);
    return path.join(this.localContextDirectory(context), id);
  }
  //#endregion

  //#region methods / local snapshot object path
  private localSnapshotObjectPath(
    context: EndpointContext,
    id: string,
    relativePath: string,
  ): string {
    if (!this.isRelativeSnapshotFile(relativePath)) {
      throw new Error('Invalid raw migration object path.');
    }
    return path.join(
      this.localSnapshotDirectory(context, id),
      ...relativePath.split('/'),
    );
  }
  //#endregion

  //#region methods / local object path
  private localObjectPath(context: EndpointContext, key: string): string {
    const root = path.resolve(context.bucketFileDbLocationBase);
    const fullPath = path.resolve(root, ...key.split('/'));
    if (fullPath !== root && !fullPath.startsWith(`${root}${path.sep}`)) {
      throw new Error('Invalid raw migration object path.');
    }
    return fullPath;
  }
  //#endregion

  //#region methods / local bucket object path
  private localBucketObjectPath(
    context: EndpointContext,
    controllerName: string,
    key: string,
  ): string {
    this.assertSafeStorageKey(key);
    const root = path.resolve(context.bucketFileDbLocationBase, controllerName);
    const fullPath = path.resolve(root, ...key.split('/'));
    if (fullPath !== root && !fullPath.startsWith(`${root}${path.sep}`)) {
      throw new Error('Invalid bucket object path.');
    }
    return fullPath;
  }
  //#endregion

  //#region methods / bucket object key
  private bucketObjectKey(controllerName: string, key: string): string {
    this.assertSafeStorageKey(key);
    return `${controllerName}/${key}`;
  }
  //#endregion

  //#region methods / assert safe storage key
  private assertSafeStorageKey(key: string): void {
    if (
      !key ||
      key.startsWith('/') ||
      key.includes('\\') ||
      key.split('/').some(part => !part || part === '.' || part === '..')
    ) {
      throw new Error(`Invalid bucket object key "${key}".`);
    }
  }
  //#endregion

  //#region methods / is relative snapshot file
  private isRelativeSnapshotFile(file: string): boolean {
    return (
      !!file &&
      !file.startsWith('/') &&
      !file.includes('\\') &&
      !file.includes('\0') &&
      !file.includes(':') &&
      file.split('/').every(part => !!part && part !== '.' && part !== '..')
    );
  }
  //#endregion

  //#region methods / is snapshot id
  private isSnapshotId(id: string): boolean {
    return /^[0-9a-f-]{36}$/.test(id);
  }
  //#endregion

  //#region methods / assert snapshot id
  private assertSnapshotId(id: string, allowStaging = false): void {
    if (
      !this.isSnapshotId(id) &&
      !(allowStaging && /^staging-[0-9a-f-]{36}$/.test(id))
    ) {
      throw new Error('Invalid raw migration snapshot identifier.');
    }
  }
  //#endregion

  //#region methods / is r2 runtime
  private isR2Runtime(): boolean {
    return UtilsOs.isRunningInCloudflareWorker();
  }
  //#endregion

  //#region methods / get r2 bucket
  private getR2Bucket(context: EndpointContext): R2Bucket {
    const bucket = context.R2;
    if (!bucket) {
      throw new Error(
        `Context "${context.contextName}" has no configured R2 bucket.`,
      );
    }
    return bucket;
  }
  //#endregion
}
