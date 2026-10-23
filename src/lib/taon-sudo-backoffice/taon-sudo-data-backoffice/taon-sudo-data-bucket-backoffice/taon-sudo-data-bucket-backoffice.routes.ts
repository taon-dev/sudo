//#region imports
import { Routes } from '@angular/router';
import { adminLazyRoute } from '@taon-dev/ui/src';
//#endregion

export const TaonSudoDataBucketBackofficeRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./taon-sudo-data-bucket-backoffice.component').then(m => m.TaonSudoDataBucketBackofficeComponent),

    children: [
      // adminLazyRoute({
      //   path: 'dashboard',
      //   menuItem: 'Dashboard',
      //   icon: 'dashboard',
      //   expandable: false,
      //   loader: () =>
      //     import('./anothermodule.routes').then(m => m.DashboardRoutes),
      // }),
    ],
  },
];

/**
 * By default exporting TaonSudoDataBucketBackofficeRoutes,
 * the command `taon generate:app:routes`
 * will automatically add them to the root routes in ./src/app.ts.
 */
// export default TaonSudoDataBucketBackofficeRoutes;