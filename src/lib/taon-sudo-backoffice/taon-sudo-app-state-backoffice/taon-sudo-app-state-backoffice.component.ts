//#region imports
import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Translation } from '@taon-dev/i18n/src';
import { Taon } from 'taon/src';
//#endregion

const t = Translation.for(Taon.__FILE_RELATIVE_PATH, Taon.LANG_IMPORT_MAP);

@Component({
  selector: 'app-taon-sudo-app-state-backoffice',
  templateUrl: './taon-sudo-app-state-backoffice.component.html',
  styleUrls: ['./taon-sudo-app-state-backoffice.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AsyncPipe, RouterOutlet],
})
export class TaonSudoAppStateBackofficeComponent {
  t = t.for(this);
}