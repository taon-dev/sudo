//#region imports
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MtxGridColumn } from '@ng-matero/extensions/grid';
import { Translation } from '@taon-dev/i18n/src';
import { TaonDatatableComponent } from '@taon-dev/ui/src';
import { Taon } from 'taon/src';

import {
  TaonSudoApiService,
  TaonSudoSqlColumn,
  TaonSudoSqlEntity,
} from '../../../taon-sudo/taon-sudo.api.service';


import {
  TaonEditAddRowComponent,
  TaonEditAddRowDialogData,
} from './taon-edit-add-row.component';
//#endregion

const t = Translation.for(Taon.__FILE_RELATIVE_PATH, Taon.LANG_IMPORT_MAP);

@Component({
  selector: 'app-taon-sudo-data-sql-backoffice',
  templateUrl: './taon-sudo-data-sql-backoffice.component.html',
  styleUrls: ['./taon-sudo-data-sql-backoffice.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatPaginatorModule,
    MatSelectModule,
    TaonDatatableComponent,
  ],
  providers: [TaonSudoApiService],
})
export class TaonSudoDataSqlBackofficeComponent {
  readonly t = t.for(this);

  readonly contexts = signal<string[]>([]);

  readonly entities = signal<TaonSudoSqlEntity[]>([]);

  readonly rows = signal<Record<string, unknown>[]>([]);

  readonly selectedContext = signal('');

  readonly selectedEntity = signal('');

  readonly columns = signal<MtxGridColumn[]>([]);

  readonly totalCount = signal(0);

  readonly page = signal(0);

  readonly pageSize = signal(25);

  readonly loading = signal(false);

  readonly error = signal('');

  get allowedColumns(): string[] {
    return this.columns().map(column => column.field);
  }

  private readonly api = inject(TaonSudoApiService);

  private readonly dialog = inject(MatDialog);

  constructor() {
    void this.initialize();
  }

  private async initialize(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const contexts = await this.api.getSqlContexts();
      this.contexts.set(contexts);
      const firstContext = contexts[0] || '';
      this.selectedContext.set(firstContext);
      if (firstContext) {
        await this.loadEntities(firstContext);
      }
    } catch (error: unknown) {
      this.reportError('Unable to discover SQL contexts.', error);
    } finally {
      this.loading.set(false);
    }
  }

  async contextChanged(contextName: string): Promise<void> {
    this.selectedContext.set(contextName);
    this.selectedEntity.set('');
    this.entities.set([]);
    this.rows.set([]);
    this.columns.set([]);
    this.totalCount.set(0);
    this.error.set('');
    if (contextName) {
      await this.loadEntities(contextName);
    }
  }

  async entityChanged(entityName: string): Promise<void> {
    this.selectedEntity.set(entityName);
    this.page.set(0);
    this.rows.set([]);
    this.columns.set([]);
    this.totalCount.set(0);
    await this.loadRows();
  }

  private async loadEntities(contextName: string): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const entities = await this.api.getSqlEntities(contextName);
      this.entities.set(entities);
      const firstEntity = entities[0]?.name || '';
      this.selectedEntity.set(firstEntity);
      this.page.set(0);
      if (firstEntity) {
        await this.loadRows();
      } else {
        this.rows.set([]);
        this.totalCount.set(0);
        this.columns.set([]);
      }
    } catch (error: unknown) {
      this.reportError('Unable to load SQL entities.', error);
    } finally {
      this.loading.set(false);
    }
  }

  async loadRows(): Promise<void> {
    const contextName = this.selectedContext();
    const entityName = this.selectedEntity();
    if (!contextName || !entityName) {
      this.rows.set([]);
      return;
    }
    this.loading.set(true);
    this.error.set('');
    try {
      const result = await this.api.getSqlRows(
        contextName,
        entityName,
        this.page(),
        this.pageSize(),
      );
      this.rows.set(result.rows);
      this.totalCount.set(result.totalCount);
      this.columns.set([
        ...result.columns.map(column => ({
          header: column.name,
          field: column.propertyName,
          sortable: false,
        })),
        {
          header: this.t.gettext('Actions'),
          field: 'actions',
          type: 'button',
          buttons: [
            {
              type: 'icon',
              icon: 'edit',
              disabled: () =>
                !this.currentEntity()?.columns.some(column => column.primary),
              tooltip: this.t.gettext('Edit row'),
              click: (row: Record<string, unknown>) => void this.editRow(row),
            },
            {
              type: 'icon',
              icon: 'delete',
              disabled: () =>
                !this.currentEntity()?.columns.some(column => column.primary),
              tooltip: this.t.gettext('Delete row'),
              click: (row: Record<string, unknown>) => void this.deleteRow(row),
            },
          ],
        },
      ]);
    } catch (error: unknown) {
      this.reportError('Unable to load SQL rows.', error);
    } finally {
      this.loading.set(false);
    }
  }

  async pageChanged(event: PageEvent): Promise<void> {
    this.page.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
    await this.loadRows();
  }

  async addRow(): Promise<void> {
    const entity = this.currentEntity();
    if (!entity) {
      return;
    }
    const result = await this.openRowDialog({ mode: 'add', entity });
    if (!result) {
      return;
    }
    this.loading.set(true);
    try {
      await this.api.addSqlRow(this.selectedContext(), entity.name, result);
      await this.loadRows();
    } catch (error: unknown) {
      this.reportError('Unable to add SQL row.', error);
    } finally {
      this.loading.set(false);
    }
  }

  async editRow(row: Record<string, unknown>): Promise<void> {
    const entity = this.currentEntity();
    if (!entity) {
      return;
    }
    const primaryKey = this.primaryKey(entity.columns, row);
    const updated = await this.openRowDialog({ mode: 'edit', entity, row });
    if (!updated) {
      return;
    }
    this.loading.set(true);
    try {
      await this.api.editSqlRow(
        this.selectedContext(),
        entity.name,
        primaryKey,
        updated,
      );
      await this.loadRows();
    } catch (error: unknown) {
      this.reportError('Unable to edit SQL row.', error);
    } finally {
      this.loading.set(false);
    }
  }

  async deleteRow(row: Record<string, unknown>): Promise<void> {
    const entity = this.currentEntity();
    if (!entity || !globalThis.confirm(this.t.gettext('Delete this row?'))) {
      return;
    }
    this.loading.set(true);
    try {
      await this.api.deleteSqlRow(
        this.selectedContext(),
        entity.name,
        this.primaryKey(entity.columns, row),
      );
      await this.loadRows();
    } catch (error: unknown) {
      this.reportError('Unable to delete SQL row.', error);
    } finally {
      this.loading.set(false);
    }
  }

  private currentEntity(): TaonSudoSqlEntity | undefined {
    return this.entities().find(
      entity => entity.name === this.selectedEntity(),
    );
  }

  private primaryKey(
    columns: TaonSudoSqlColumn[],
    row: Record<string, unknown>,
  ): Record<string, unknown> {
    return Object.fromEntries(
      columns
        .filter(column => column.primary)
        .map(column => [column.propertyName, row[column.propertyName]]),
    );
  }

  private openRowDialog(
    data: Omit<TaonEditAddRowDialogData, 'columns'> & {
      entity: TaonSudoSqlEntity;
    },
  ): Promise<Record<string, unknown> | undefined> {
    const dialogData: TaonEditAddRowDialogData = {
      mode: data.mode,
      columns: data.entity.columns,
      row: data.row,
    };
    const ref = this.dialog.open(TaonEditAddRowComponent, {
      width: '640px',
      maxWidth: '95vw',
      data: dialogData,
    });
    return new Promise(resolve => ref.afterClosed().subscribe(resolve));
  }

  private reportError(message: string, error: unknown): void {
    console.error(`[taon-sudo-data-sql-backoffice] ${message}`, error);
    this.error.set(this.t.gettext(message));
  }
}
