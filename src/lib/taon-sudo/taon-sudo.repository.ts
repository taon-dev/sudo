//#region imports
import {
  TaonBaseCustomRepository,
  TaonRepository,
  Models,
  ClassHelpers,
  TaonBaseKvSyncRepository,
  TaonBaseKvRepository,
  EndpointContext,
} from 'taon/src';
import { Repository } from 'taon-typeorm/src';

//#endregion

@TaonRepository({
  className: 'TaonSudoRepository',
})
export class TaonSudoRepository extends TaonBaseCustomRepository {
  //#region methods / get crud repository for context
  getCrudRepositoryForContext(
    context: EndpointContext,
    className: string,
  ): Repository<any> {
    //#region @websqlFunc
    // const classFun = context.getClassFunByClassName(className);
    // if (!classFun || !context.connection) {
    //   throw new Error(
    //     `SQL entity "${className}" is not available in context "${context.contextName}".`,
    //   );
    // }
    return context.connection.getRepository(className);
    //#endregion
  }
  //#endregion

  //#region methods / get crud repository by name
  async getCrudRepositoryByName(className: string): Promise<Repository<any>> {
    //#region @websqlFunc
    const classFun = this.ctx.getClassFunByClassName(className);
    return this.ctx.connection.getRepository(classFun);
    //#endregion
  }
  //#endregion

  //#region methods / get kv repository by name
  async getKvRepositoryByName(
    className: string,
  ): Promise<TaonBaseKvRepository<any>> {
    //#region @websqlFunc
    const classFun = this.ctx.getClassFunByClassName(className);
    return this.ctx.getInstanceBy(classFun as any);
    //#endregion
  }
  //#endregion

  //#region methods / get kv sync repository by name
  async getKvSyncRepositoryByName(
    className: string,
  ): Promise<TaonBaseKvSyncRepository<any>> {
    //#region @websqlFunc
    const classFun = this.ctx.getClassFunByClassName(className);
    return this.ctx.getInstanceBy(classFun as any);
    //#endregion
  }
  //#endregion

  //#region methods / get all entites name
  async getAllEntitesName<T>(className: string): Promise<string[]> {
    //#region @websqlFunc
    const allentities = this.ctx.getClassFunByArr(Models.ClassType.ENTITY);
    return allentities.map(fn => ClassHelpers.getName(fn));
    //#endregion
  }
  //#endregion

  //#region methods / get all kv repositories names
  async getAllKVRepositoriesNames<T>(className: string): Promise<string[]> {
    //#region @websqlFunc
    const allentities = this.ctx.getClassFunByArr(Models.ClassType.REPOSITORY);
    return allentities
      .filter(classFn => {
        return (
          classFn === TaonBaseKvRepository ||
          classFn === TaonBaseKvSyncRepository ||
          classFn.prototype instanceof TaonBaseKvRepository ||
          classFn.prototype instanceof TaonBaseKvSyncRepository
        );
      })
      .map(fn => ClassHelpers.getName(fn));
    //#endregion
  }
  //#endregion
}
