//#region imports
import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { RouterOutlet } from '@angular/router';
import { Translation } from '@taon-dev/i18n/src';
import {
  getHttpStatusCodeMessages,
  getStatusCode,
  HttpStatusEnum,
  Taon,
  TaonAdminService,
} from 'taon/src';
//#endregion

const t = Translation.for(Taon.__FILE_RELATIVE_PATH, Taon.LANG_IMPORT_MAP);

@Component({
  selector: 'app-taon-sudo-http-errors-backoffice',
  templateUrl: './taon-sudo-http-errors-backoffice.component.html',
  styleUrls: ['./taon-sudo-http-errors-backoffice.component.scss'],
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
export class TaonSudoHttpErrorsBackofficeComponent {
  t = t.for(this);

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
