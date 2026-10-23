//#region imports
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Taon, TaonBaseAngularService } from 'taon/src';

import { TaonSudoProvider } from './taon-sudo.provider';
//#endregion

@Injectable()
export class TaonSudoConfigService extends TaonBaseAngularService {
  private taonSudoProvider = this.injectProvider(TaonSudoProvider);

  clone(): Partial<TaonSudoProvider> {
    const cloned = this.taonSudoProvider.clone();
    return cloned;
  }
}
