//#region imports
import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Translation } from '@taon-dev/i18n/src';
import { Taon } from 'taon/src';
//#endregion

const t = Translation.for(Taon.__FILE_RELATIVE_PATH, Taon.LANG_IMPORT_MAP);

@Component({
  selector: 'app-taon-sudo-data-backoffice',
  templateUrl: './taon-sudo-data-backoffice.component.html',
  styleUrls: ['./taon-sudo-data-backoffice.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AsyncPipe, RouterOutlet],
})
export class TaonSudoDataBackofficeComponent {
  t = t.for(this);
}