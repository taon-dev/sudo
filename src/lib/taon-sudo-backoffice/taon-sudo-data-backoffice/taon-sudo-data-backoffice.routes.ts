//#region imports
import { Routes } from '@angular/router';
import { adminLazyRoute } from '@taon-dev/ui/src';
//#endregion

export const TaonSudoDataBackofficeRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./taon-sudo-data-backoffice.component').then(
        m => m.TaonSudoDataBackofficeComponent,
      ),

    children: [
      adminLazyRoute({
        path: 'sql',
        menuItem: 'SQL',
        icon: 'sql',
        expandable: false,
        loader: () =>
          import('./taon-sudo-data-sql-backoffice/taon-sudo-data-sql-backoffice.routes').then(
            m => m.TaonSudoDataSqlBackofficeRoutes,
          ),
      }),
      adminLazyRoute({
        path: 'kv',
        menuItem: 'KV',
        icon: 'kv',
        expandable: false,
        loader: () =>
          import('./taon-sudo-data-kv-backoffice/taon-sudo-data-kv-backoffice.routes').then(
            m => m.TaonSudoDataKvBackofficeRoutes,
          ),
      }),

      adminLazyRoute({
        path: 'bucket',
        menuItem: 'Bucket',
        icon: 'bucket',
        expandable: false,
        loader: () =>
          import('./taon-sudo-data-bucket-backoffice/taon-sudo-data-bucket-backoffice.routes').then(
            m => m.TaonSudoDataBucketBackofficeRoutes,
          ),
      }),
    ],
  },
];

/**
 * By default exporting TaonSudoDataBackofficeRoutes,
 * the command `taon generate:app:routes`
 * will automatically add them to the root routes in ./src/app.ts.
 */
// export default TaonSudoDataBackofficeRoutes;
