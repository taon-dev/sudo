import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatSelectModule } from '@angular/material/select';
import { MtxGridColumn } from '@ng-matero/extensions/grid';
import { Translation } from '@taon-dev/i18n/src';
import { TaonDatatableComponent } from '@taon-dev/ui/src';
import { firstValueFrom } from 'rxjs';
import { Taon, TaonStorageObject } from 'taon/src';

import { TaonSudoApiService } from '../../../taon-sudo/taon-sudo.api.service';
import { TaonSudoUtils } from '../../../taon-sudo/taon-sudo.utils';
import { TaonSudoConfirmDialogComponent } from '../../taon-sudo-confirm-dialog.component';

import { TaonSudoBucketAssetPreviewComponent } from './taon-sudo-bucket-asset-preview.component';
import {
  TaonSudoBucketUploadDialogComponent,
  TaonSudoBucketUploadDialogData,
} from './taon-sudo-bucket-upload-dialog.component';

const t = Translation.for(Taon.__FILE_RELATIVE_PATH, Taon.LANG_IMPORT_MAP);

@Component({
  selector: 'app-taon-sudo-data-bucket-backoffice',
  templateUrl: './taon-sudo-data-bucket-backoffice.component.html',
  styleUrls: ['./taon-sudo-data-bucket-backoffice.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatSelectModule,
    TaonDatatableComponent,
    TaonSudoBucketAssetPreviewComponent,
  ],
  providers: [TaonSudoApiService],
})
export class TaonSudoDataBucketBackofficeComponent {
  readonly t = t.for(this);

  readonly contexts = signal<string[]>([]);

  readonly storageControllers = signal<string[]>([]);

  readonly files = signal<TaonStorageObject[]>([]);

  readonly selectedContext = signal('');

  readonly selectedController = signal('');

  readonly loading = signal(false);

  readonly error = signal('');

  readonly status = signal('');

  /**
   * Table rows (size formatted for humans, raw size kept for sorting/preview).
   */
  readonly rows = computed(() =>
    this.files().map(file => ({
      ...file,
      sizeLabel: TaonSudoUtils.formatBytes(file.size),
    })),
  );

  readonly columns: MtxGridColumn[] = [
    {
      header: this.t.gettext('Key'),
      field: 'key',
      sortable: true,
      showExpand: true,
    },
    { header: this.t.gettext('File Name'), field: 'fileName', sortable: true },
    {
      header: this.t.gettext('Content Type'),
      field: 'contentType',
      sortable: true,
    },
    { header: this.t.gettext('Size'), field: 'sizeLabel' },
    {
      header: this.t.gettext('Actions'),
      field: 'actions',
      type: 'button',
      buttons: [
        {
          type: 'icon',
          icon: 'swap_horiz',
          tooltip: this.t.gettext('Replace'),
          click: (file: TaonStorageObject) => void this.replace(file),
        },
        {
          type: 'icon',
          icon: 'download',
          tooltip: this.t.gettext('Download'),
          click: (file: TaonStorageObject) => this.download(file),
        },
        {
          type: 'icon',
          icon: 'delete',
          tooltip: this.t.gettext('Delete file'),
          click: (file: TaonStorageObject) => void this.remove(file),
        },
      ],
    },
  ];

  private readonly api = inject(TaonSudoApiService);

  private readonly dialog = inject(MatDialog);

  private readonly injector = inject(Injector);

  constructor() {
    void this.initialize();
  }

  private async initialize(): Promise<void> {
    this.loading.set(true);
    try {
      const contexts = await this.api.getContexts();
      this.contexts.set(contexts);
      const firstContext = contexts[0] || '';
      this.selectedContext.set(firstContext);
      if (firstContext) {
        await this.loadControllers(firstContext);
      }
    } catch (error: unknown) {
      this.fail('Unable to discover storage contexts.', error);
    } finally {
      this.loading.set(false);
    }
  }

  async contextChanged(contextName: string): Promise<void> {
    this.selectedContext.set(contextName);
    this.selectedController.set('');
    this.storageControllers.set([]);
    this.files.set([]);
    this.error.set('');
    if (contextName) {
      await this.loadControllers(contextName);
    }
  }

  async controllerChanged(controllerName: string): Promise<void> {
    this.selectedController.set(controllerName);
    this.files.set([]);
    await this.reload();
  }

  private async loadControllers(contextName: string): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const controllers = await this.api.getStorageControllers(contextName);
      this.storageControllers.set(controllers);
      this.selectedController.set(controllers[0] || '');
      if (controllers[0]) {
        await this.reload();
      } else {
        this.files.set([]);
      }
    } catch (error: unknown) {
      this.fail('Unable to load storage controllers.', error);
    } finally {
      this.loading.set(false);
    }
  }

  async reload(): Promise<void> {
    const contextName = this.selectedContext();
    const controllerName = this.selectedController();
    if (!contextName || !controllerName) {
      this.files.set([]);
      return;
    }
    this.loading.set(true);
    this.error.set('');
    try {
      this.files.set(
        await this.api.getBucketFiles(contextName, controllerName),
      );
    } catch (error: unknown) {
      this.fail('Unable to load bucket files.', error);
    } finally {
      this.loading.set(false);
    }
  }

  async uploadNew(): Promise<void> {
    const result = await this.openUploadDialog({
      mode: 'upload',
      contextName: this.selectedContext(),
      controllerName: this.selectedController(),
    });
    if (result) {
      this.status.set(
        this.t.gettext('Asset [[ key ]] uploaded.', { key: result.key }),
      );
      await this.reload();
    }
  }

  async replace(file: TaonStorageObject): Promise<void> {
    const result = await this.openUploadDialog({
      mode: 'replace',
      contextName: this.selectedContext(),
      controllerName: this.selectedController(),
      existing: file,
    });
    if (result) {
      this.status.set(
        this.t.gettext('Asset [[ key ]] replaced.', { key: result.key }),
      );
      await this.reload();
    }
  }

  private openUploadDialog(
    data: TaonSudoBucketUploadDialogData,
  ): Promise<TaonStorageObject | undefined> {
    if (!data.contextName || !data.controllerName) {
      return Promise.resolve(undefined);
    }
    const ref = this.dialog.open<
      TaonSudoBucketUploadDialogComponent,
      TaonSudoBucketUploadDialogData,
      TaonStorageObject | undefined
    >(TaonSudoBucketUploadDialogComponent, {
      data,
      width: '640px',
      maxWidth: '95vw',
      // dialog needs the component level TaonSudoApiService provider
      injector: this.injector,
    });
    return firstValueFrom(ref.afterClosed());
  }

  async clearBucket(): Promise<void> {
    const contextName = this.selectedContext();
    const controllerName = this.selectedController();
    if (!contextName || !controllerName) {
      return;
    }
    const confirmed = await TaonSudoConfirmDialogComponent.confirm(
      this.dialog,
      {
        title: this.t.gettext('Clear bucket'),
        message: this.t.gettext(
          'All objects in bucket [[ bucket ]] (context [[ context ]]) will be permanently deleted. The bucket itself is kept.',
          { bucket: controllerName, context: contextName },
        ),
        confirmLabel: this.t.gettext('Clear'),
        destructive: true,
      },
    );
    if (confirmed) {
      await this.clear(contextName, [controllerName]);
    }
  }

  async clearAll(): Promise<void> {
    const contextName = this.selectedContext();
    const controllers = this.storageControllers();
    if (!contextName || !controllers.length) {
      return;
    }
    const confirmed = await TaonSudoConfirmDialogComponent.confirm(
      this.dialog,
      {
        title: this.t.gettext('Clear ALL buckets'),
        message: this.t.gettext(
          'Objects from ALL [[ count ]] buckets of context [[ context ]] will be permanently deleted. Bucket definitions are kept.',
          { count: controllers.length, context: contextName },
        ),
        details: [controllers.join(', ')],
        confirmLabel: this.t.gettext('Clear All'),
        destructive: true,
        requiredPhrase: contextName,
      },
    );
    if (confirmed) {
      await this.clear(contextName, controllers);
    }
  }

  private async clear(
    contextName: string,
    controllers: string[],
  ): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    this.status.set('');
    const failures: string[] = [];
    let deletedTotal = 0;
    try {
      for (const controllerName of controllers) {
        let deleted = 0;
        let failed = 0;
        try {
          // batches of objects until the backend reports completion
          for (;;) {
            const batch = await this.api.clearBucketBatch(
              contextName,
              controllerName,
            );
            deleted += batch.deleted;
            failed += batch.failed;
            this.status.set(
              this.t.gettext(
                'Clearing [[ bucket ]]... [[ deleted ]] objects deleted.',
                { bucket: controllerName, deleted },
              ),
            );
            if (batch.done) {
              break;
            }
          }
        } catch (error: unknown) {
          console.error(
            `[taon-sudo-data-bucket-backoffice] Clear failed for ${controllerName}`,
            error,
          );
          failures.push(`${controllerName} (${this.errorMessage(error)})`);
        }
        if (failed) {
          failures.push(
            this.t.gettext('[[ bucket ]] ([[ failed ]] objects not deleted)', {
              bucket: controllerName,
              failed,
            }),
          );
        }
        deletedTotal += deleted;
      }
      this.status.set(
        this.t.gettext('[[ deleted ]] objects deleted.', {
          deleted: deletedTotal,
        }),
      );
      if (failures.length) {
        this.error.set(
          this.t.gettext('Some buckets were not fully cleared: [[ list ]]', {
            list: failures.join('; '),
          }),
        );
      }
    } finally {
      this.loading.set(false);
    }
    await this.reload();
  }

  download(file: TaonStorageObject): void {
    const link = document.createElement('a');
    link.href = this.api.getBucketFileUrl(
      this.selectedContext(),
      this.selectedController(),
      file.key,
      true,
    );
    link.download = file.fileName || '';
    link.click();
  }

  async remove(file: TaonStorageObject): Promise<void> {
    const confirmed = await TaonSudoConfirmDialogComponent.confirm(
      this.dialog,
      {
        title: this.t.gettext('Delete file'),
        message: this.t.gettext(
          'Delete [[ key ]] ([[ size ]]) from bucket [[ bucket ]]?',
          {
            key: file.key,
            size: TaonSudoUtils.formatBytes(file.size),
            bucket: this.selectedController(),
          },
        ),
        confirmLabel: this.t.gettext('Delete'),
        destructive: true,
      },
    );
    if (!confirmed) {
      return;
    }
    this.loading.set(true);
    try {
      await this.api.deleteBucketFile(
        this.selectedContext(),
        this.selectedController(),
        file.key,
      );
      await this.reload();
    } catch (error: unknown) {
      this.fail('Unable to delete bucket file.', error);
    } finally {
      this.loading.set(false);
    }
  }

  private errorMessage(error: unknown): string {
    const body = (error as { body?: { json?: { message?: string } } })?.body;
    return (
      body?.json?.message ||
      (error instanceof Error ? error.message : String(error))
    );
  }

  private fail(message: string, error: unknown): void {
    console.error(`[taon-sudo-data-bucket-backoffice] ${message}`, error);
    this.error.set(this.t.gettext(message));
  }
}
