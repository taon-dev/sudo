//#region imports
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Taon, TaonBaseAngularService } from 'taon/src';

import { TaonSudoController } from './taon-sudo.controller';
//#endregion

@Injectable()
export class TaonSudoApiService extends TaonBaseAngularService {
  private readonly taonSudoController =
    this.injectController(TaonSudoController);

  public get crudController(): TaonSudoController {
    return this.taonSudoController;
  }



}
