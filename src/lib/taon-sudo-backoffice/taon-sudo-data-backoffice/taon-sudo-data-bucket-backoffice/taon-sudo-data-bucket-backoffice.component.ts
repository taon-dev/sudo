import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MtxGridColumn } from '@ng-matero/extensions/grid';
import { TaonDatatableComponent } from '@taon-dev/ui/src';
import { Translation } from '@taon-dev/i18n/src';
import { Taon, TaonStorageObject } from 'taon/src';

import { TaonSudoApiService } from '../../../taon-sudo/taon-sudo.api.service';

const t = Translation.for(Taon.__FILE_RELATIVE_PATH, Taon.LANG_IMPORT_MAP);

@Component({
  selector: 'app-taon-sudo-data-bucket-backoffice',
  templateUrl: './taon-sudo-data-bucket-backoffice.component.html',
  styleUrls: ['./taon-sudo-data-bucket-backoffice.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatSelectModule, TaonDatatableComponent],
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
  readonly columns: MtxGridColumn[] = [
    { header: this.t.gettext('Key'), field: 'key', sortable: true },
    { header: this.t.gettext('File Name'), field: 'fileName', sortable: true },
    {
      header: this.t.gettext('Content Type'),
      field: 'contentType',
      sortable: true,
    },
    { header: this.t.gettext('Size'), field: 'size', sortable: true },
    {
      header: this.t.gettext('Actions'),
      field: 'actions',
      type: 'button',
      buttons: [
        {
          type: 'icon',
          icon: 'visibility',
          tooltip: this.t.gettext('Preview'),
          click: (file: TaonStorageObject) => this.preview(file),
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

  async upload(event: Event): Promise<void> {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    this.loading.set(true);
    this.error.set('');
    try {
      await this.api.uploadBucketFile(
        this.selectedContext(),
        this.selectedController(),
        file,
      );
      await this.reload();
    } catch (error: unknown) {
      this.fail('Unable to upload or replace the bucket file.', error);
    } finally {
      input.value = '';
      this.loading.set(false);
    }
  }

  preview(file: TaonStorageObject): void {
    const url = this.api.getBucketFileUrl(
      this.selectedContext(),
      this.selectedController(),
      file.key,
    );
    globalThis.open(url, '_blank', 'noopener,noreferrer');
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
    if (
      !globalThis.confirm(this.t.gettext(`Delete bucket file "${file.key}"?`))
    ) {
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

  private fail(message: string, error: unknown): void {
    console.error(`[taon-sudo-data-bucket-backoffice] ${message}`, error);
    this.error.set(this.t.gettext(message));
  }
}
