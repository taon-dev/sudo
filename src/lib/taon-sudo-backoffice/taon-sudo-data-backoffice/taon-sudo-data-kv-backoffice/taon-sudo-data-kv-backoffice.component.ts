import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MtxGridColumn } from '@ng-matero/extensions/grid';
import { TaonDatatableComponent } from '@taon-dev/ui/src';
import { Translation } from '@taon-dev/i18n/src';
import { Taon } from 'taon/src';

import { TaonSudoApiService } from '../../../taon-sudo/taon-sudo.api.service';

const t = Translation.for(Taon.__FILE_RELATIVE_PATH, Taon.LANG_IMPORT_MAP);

interface KvRow {
  key: string;
  value: unknown;
}

@Component({
  selector: 'app-taon-sudo-data-kv-backoffice',
  templateUrl: './taon-sudo-data-kv-backoffice.component.html',
  styleUrls: ['./taon-sudo-data-kv-backoffice.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    TaonDatatableComponent,
  ],
  providers: [TaonSudoApiService],
})
export class TaonSudoDataKvBackofficeComponent {
  readonly t = t.for(this);
  readonly contexts = signal<string[]>([]);
  readonly repositories = signal<string[]>([]);
  readonly rows = signal<KvRow[]>([]);
  readonly columns: MtxGridColumn[] = [
    { header: this.t.gettext('Key'), field: 'key', sortable: true },
    { header: this.t.gettext('Value'), field: 'displayValue' },
    {
      header: this.t.gettext('Actions'),
      field: 'actions',
      type: 'button',
      buttons: [
        {
          type: 'icon',
          icon: 'edit',
          tooltip: this.t.gettext('Edit value'),
          click: (row: KvRow) => this.edit(row),
        },
        {
          type: 'icon',
          icon: 'delete',
          tooltip: this.t.gettext('Delete key'),
          click: (row: KvRow) => void this.remove(row),
        },
      ],
    },
  ];
  readonly selectedContext = signal('');
  readonly selectedRepository = signal('');
  readonly keyInput = signal('');
  readonly valueInput = signal('');
  readonly editorOpen = signal(false);
  readonly editing = signal(false);
  readonly loading = signal(false);
  readonly error = signal('');

  private readonly api = inject(TaonSudoApiService);

  constructor() {
    void this.initialize();
  }

  get tableRows(): Record<string, unknown>[] {
    return this.rows().map(row => ({
      ...row,
      displayValue:
        typeof row.value === 'string'
          ? row.value
          : JSON.stringify(row.value, null, 2),
    }));
  }

  private async initialize(): Promise<void> {
    this.loading.set(true);
    try {
      const contexts = await this.api.getContexts();
      this.contexts.set(contexts);
      const contextName = contexts[0] || '';
      this.selectedContext.set(contextName);
      if (contextName) {
        await this.loadRepositories(contextName);
      }
    } catch (error: unknown) {
      this.fail('Unable to discover KV contexts.', error);
    } finally {
      this.loading.set(false);
    }
  }

  async contextChanged(contextName: string): Promise<void> {
    this.selectedContext.set(contextName);
    this.selectedRepository.set('');
    this.repositories.set([]);
    this.rows.set([]);
    this.error.set('');
    if (contextName) {
      await this.loadRepositories(contextName);
    }
  }

  async repositoryChanged(repositoryName: string): Promise<void> {
    this.selectedRepository.set(repositoryName);
    this.rows.set([]);
    await this.reload();
  }

  private async loadRepositories(contextName: string): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const repositories = await this.api.getKvRepositories(contextName);
      this.repositories.set(repositories);
      this.selectedRepository.set(repositories[0] || '');
      if (repositories[0]) {
        await this.reload();
      } else {
        this.rows.set([]);
      }
    } catch (error: unknown) {
      this.fail('Unable to load KV repositories.', error);
    } finally {
      this.loading.set(false);
    }
  }

  async reload(): Promise<void> {
    const contextName = this.selectedContext();
    const repositoryName = this.selectedRepository();
    if (!contextName || !repositoryName) {
      this.rows.set([]);
      return;
    }
    this.loading.set(true);
    this.error.set('');
    try {
      this.rows.set(await this.api.getKvData(contextName, repositoryName));
    } catch (error: unknown) {
      this.fail('Unable to load KV data.', error);
    } finally {
      this.loading.set(false);
    }
  }

  startAdd(): void {
    this.keyInput.set('');
    this.valueInput.set('');
    this.editing.set(false);
    this.editorOpen.set(true);
  }

  edit(row: KvRow): void {
    this.keyInput.set(row.key);
    this.valueInput.set(JSON.stringify(row.value, null, 2));
    this.editing.set(true);
    this.editorOpen.set(true);
  }

  async save(): Promise<void> {
    const key = this.keyInput().trim();
    if (!key) {
      this.error.set(this.t.gettext('A key is required.'));
      return;
    }
    let value: unknown;
    try {
      value = JSON.parse(this.valueInput());
    } catch (error: unknown) {
      this.error.set(this.t.gettext('Value must be valid JSON.'));
      return;
    }
    this.loading.set(true);
    this.error.set('');
    try {
      await this.api.setKvValue(
        this.selectedContext(),
        this.selectedRepository(),
        key,
        value,
      );
      this.editorOpen.set(false);
      await this.reload();
    } catch (error: unknown) {
      this.fail('Unable to save KV value.', error);
    } finally {
      this.loading.set(false);
    }
  }

  async remove(row: KvRow): Promise<void> {
    if (!globalThis.confirm(this.t.gettext(`Delete KV key "${row.key}"?`))) {
      return;
    }
    this.loading.set(true);
    try {
      await this.api.deleteKvValue(
        this.selectedContext(),
        this.selectedRepository(),
        row.key,
      );
      await this.reload();
    } catch (error: unknown) {
      this.fail('Unable to delete KV value.', error);
    } finally {
      this.loading.set(false);
    }
  }

  updateKey(event: Event): void {
    if (event.target instanceof HTMLInputElement) {
      this.keyInput.set(event.target.value);
    }
  }

  updateValue(event: Event): void {
    if (event.target instanceof HTMLTextAreaElement) {
      this.valueInput.set(event.target.value);
    }
  }

  private fail(message: string, error: unknown): void {
    console.error(`[taon-sudo-data-kv-backoffice] ${message}`, error);
    this.error.set(this.t.gettext(message));
  }
}
