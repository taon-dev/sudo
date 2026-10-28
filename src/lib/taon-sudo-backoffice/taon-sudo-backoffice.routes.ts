//#region imports
import { Routes } from '@angular/router';
import { adminLazyRoute } from '@taon-dev/ui/src';
//#endregion

export const TaonSudoBackofficeRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./taon-sudo-backoffice.component').then(
        m => m.TaonSudoBackofficeComponent,
      ),

    children: [
      adminLazyRoute({
        path: 'data',
        menuItem: 'Data',
        color: 'red',
        icon: 'storage',
        expandable: false,
        loader: () =>
          import('./taon-sudo-data-backoffice/taon-sudo-data-backoffice.routes').then(
            m => m.TaonSudoDataBackofficeRoutes,
          ),
      }),

      adminLazyRoute({
        path: 'app-state',
        menuItem: 'App State',
        icon: 'power',
        color: 'red',
        expandable: false,
        loader: () =>
          import('./taon-sudo-app-state-backoffice/taon-sudo-app-state-backoffice.routes').then(
            m => m.TaonSudoAppStateBackofficeRoutes,
          ),
      }),

      adminLazyRoute({
        path: 'http-errors',
        menuItem: 'HTTP Errors',
        icon: 'error',
        color: 'red',
        expandable: false,
        loader: () =>
          import('./taon-sudo-http-errors-backoffice/taon-sudo-http-errors-backoffice.routes').then(
            m => m.TaonSudoHttpErrorsBackofficeRoutes,
          ),
      }),

      adminLazyRoute({
        path: 'raw-migrations',
        menuItem: 'Raw Migrations',
        icon: 'swap_vert',
        color: 'red',
        expandable: false,
        loader: () =>
          import('./taon-sudo-raw-migrations-backoffice/taon-sudo-raw-migrations-backoffice.routes').then(
            m => m.TaonSudoRawMigrationsBackofficeRoutes,
          ),
      }),
    ],
  },
];

/**
 * By default exporting TaonSudoBackofficeRoutes,
 * the command `taon generate:app:routes`
 * will automatically add them to the root routes in ./src/app.ts.
 */
// export default TaonSudoBackofficeRoutes;
