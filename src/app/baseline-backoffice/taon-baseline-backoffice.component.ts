//#region imports
import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ENV_ANGULAR_NODE_APP_WEBSITE_TITLE } from '@taon-dev/session/src';
import {
  TaonAdminLayoutComponent,
  TaonBackofficeNotificationsComponent,
} from '@taon-dev/ui/src';
import { HttpResponseError, RestErrorResponseWrapper } from 'ng2-rest/src';

import { TaonBaselineBackofficeOutletName } from './taon-baseline-backoffice.models';
import { TaonBaselineBackofficeRoutes } from './taon-baseline-backoffice.routes';
//#endregion

@Component({
  selector: 'app-taon-baseline-backoffice',
  templateUrl: './taon-baseline-backoffice.component.html',
  styleUrls: ['./taon-baseline-backoffice.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AsyncPipe,
    RouterOutlet,
    TaonAdminLayoutComponent,
    TaonBackofficeNotificationsComponent,
  ],
})
export class TaonBaselineBackofficeComponent {
  title = ENV_ANGULAR_NODE_APP_WEBSITE_TITLE || 'Application Title';

  get adminRoutes() {
    return TaonBaselineBackofficeRoutes[0].children;
  }

  outlet = TaonBaselineBackofficeOutletName;

  filter(
    error: HttpResponseError<RestErrorResponseWrapper>,
  ): HttpResponseError<RestErrorResponseWrapper> {
    return error;
  }
}
