//#region imports
import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { RouterOutlet } from '@angular/router';
import {
  getHttpStatusCodeMessages,
  getStatusCode,
  HttpStatusEnum,
  TaonAdminService,
} from 'taon/src';
import { Helpers } from 'tnp-core/src';
import { TaonSudoApiService } from '../taon-sudo/taon-sudo.api.service';
//#endregion

@Component({
  selector: 'app-taon-sudo-backoffice',
  templateUrl: './taon-sudo-backoffice.component.html',
  styleUrls: ['./taon-sudo-backoffice.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AsyncPipe,
    RouterOutlet,
    MatCardModule,
    MatCheckboxModule,
    FormsModule,
    ReactiveFormsModule,
  ],
  providers: [TaonSudoApiService],
})
export class TaonSudoBackofficeComponent {
  taonSudoApiService = inject(TaonSudoApiService);

  contextsData$ = this.taonSudoApiService.getAllContextsData();

  public readonly isWebSQLMode: boolean = Helpers.getIsWebSQL();

  componentLoaded = false;

  onRouteActivate(component: any): void {
    this.componentLoaded = !!component;
  }

  onRouteDeactivate(component: any): void {
    this.componentLoaded = false;
  }

  public readonly taonAdminService = inject(TaonAdminService);
}
