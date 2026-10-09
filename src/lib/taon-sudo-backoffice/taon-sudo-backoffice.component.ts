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
})
export class TaonSudoBackofficeComponent {
  public readonly isWebSQLMode: boolean = Helpers.getIsWebSQL();

  public readonly taonAdminService = inject(TaonAdminService);

  public readonly errorStatuses = Object.values(HttpStatusEnum).filter(
    status => getStatusCode(status) >= 400,
  );

  public readonly statusMessages = getHttpStatusCodeMessages();

  public isSkipped(status: HttpStatusEnum): boolean {
    return this.taonAdminService.skipShowingErrors().includes(status);
  }

  public setSkipped(status: HttpStatusEnum, checked: boolean): void {
    this.taonAdminService.setSkipShowingError(status, checked);
  }

  public getStatusCode(status: HttpStatusEnum): number {
    return getStatusCode(status);
  }
}
