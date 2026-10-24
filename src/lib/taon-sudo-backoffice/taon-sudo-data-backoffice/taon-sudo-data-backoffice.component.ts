//#region imports
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
//#endregion

@Component({
  selector: 'app-taon-sudo-data-backoffice',
  templateUrl: './taon-sudo-data-backoffice.component.html',
  styleUrls: ['./taon-sudo-data-backoffice.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
})
export class TaonSudoDataBackofficeComponent {}
