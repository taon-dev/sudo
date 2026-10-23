//#region imports
import {
  TaonBaseRepository,
  TaonBaseCustomRepository,
  TaonRepository,
  Models,
  ClassHelpers,
  TaonBaseKvSyncRepository,
  TaonBaseKvRepository,
} from 'taon/src';
import { Raw, Repository } from 'taon-typeorm/src';

//#endregion

@TaonRepository({
  className: 'TaonSudoRepository',
})
export class TaonSudoRepository extends TaonBaseCustomRepository {
  async getCrudRepositoryByName(className: string): Promise<Repository<any>> {
    //#region @websqlFunc
    const classFun = this.ctx.getClassFunByClassName(className);
    return this.ctx.connection.getRepository(classFun);
    //#endregion
  }

  async getKvRepositoryByName(
    className: string,
  ): Promise<TaonBaseKvRepository<any>> {
    //#region @websqlFunc
    const classFun = this.ctx.getClassFunByClassName(className);
    return this.ctx.getInstanceBy(classFun as any);
    //#endregion
  }

  async getKvSyncRepositoryByName(
    className: string,
  ): Promise<TaonBaseKvSyncRepository<any>> {
    //#region @websqlFunc
    const classFun = this.ctx.getClassFunByClassName(className);
    return this.ctx.getInstanceBy(classFun as any);
    //#endregion
  }

  async getAllEntitesName<T>(className: string): Promise<string[]> {
    //#region @websqlFunc
    const allentities = this.ctx.getClassFunByArr(Models.ClassType.ENTITY);
    return allentities.map(fn => ClassHelpers.getName(fn));
    //#endregion
  }

  async getAllKVRepositoriesNames<T>(className: string): Promise<string[]> {
    //#region @websqlFunc
    const allentities = this.ctx.getClassFunByArr(Models.ClassType.REPOSITORY);
    return allentities
      .filter(classFn => {
        return (
          classFn instanceof TaonBaseKvRepository ||
          classFn instanceof TaonBaseKvSyncRepository
        );
      })
      .map(fn => ClassHelpers.getName(fn));
    //#endregion
  }
}
