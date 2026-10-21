//#region imports
import { Routes } from '@angular/router';
import { adminLazyRoute } from '@taon-dev/ui/src';
//#endregion

export const TaonBaselineBackofficeRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./taon-baseline-backoffice.component').then(
        m => m.TaonBaselineBackofficeComponent,
      ),

    children: [
      adminLazyRoute({
        path: 'sudo',
        menuItem: 'Sudo',
        color: 'red',
        icon: 'supervisor_account',
        expandable: false,
        loader: () =>
          import('@taon-dev/sudo/src').then(m => m.TaonSudoBackofficeRoutes),
      }),

      adminLazyRoute({
        path: 'users',
        menuItem: 'Users',
        icon: 'manage_accounts',
        expandable: false,
        loader: () =>
          import('@taon-dev/session/src').then(
            m => m.TaonSessionBackofficeUsersRoutes,
          ),
      }),
      adminLazyRoute({
        path: 'session',
        menuItem: 'Sessions',
        expandable: false,
        icon: 'login',
        loader: () =>
          import('@taon-dev/session/src').then(
            m => m.TaonSessionBackofficeRoutes,
          ),
      }),
      adminLazyRoute({
        path: 'authorization',
        menuItem: 'Authorization',
        icon: 'apps',
        expandable: true,
        loader: () =>
          import('@taon-dev/session/src').then(
            m => m.TaonAuthorizationBackofficeRoutes,
          ),
      }),
    ],
  },
];

/**
 * By default exporting TaonBaselineBackofficeRoutes,
 * the command `taon generate:app:routes`
 * will automatically add them to the root routes in ./src/app.ts.
 */
// export default TaonBaselineBackofficeRoutes;
