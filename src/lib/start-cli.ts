//#region tnp-helpers cli template
import { UtilsJson } from 'tnp-core/src';
import { Helpers, BaseCommandLineFeature } from 'tnp-helpers/src';
import { BaseProject, BaseStartConfig } from 'tnp-helpers/src'; // @backend
//#endregion

//#region CLI / global scope
/**
 * This class is for handling global arguments. *
 * Cli engine will parse: hello:world:from:global:arg to helloWorldFromGlobalArg
 * (lower case, camel case) .. so you don't need to worry about misspelling
 * arguments
 */
class $Global extends BaseCommandLineFeature<{}> {
  /**
   * When you execute cli without arguments:`$ cli`
   */
  public _() {
    console.log(`Hello world from cli`);
    this._exit();
  }

  /**
   * When you execute: `$ cli hello:world:from:global:arg`
   * (or `$ cli helloWorldFromGlobalArg`)
   */
  helloWorldFromGlobalArg() {
    console.log('hello world from global argument!');
    this._exit(0);
  }
}
//#endregion

//#region CLI / Version Scope
/**
 *
 */
class $Version extends BaseCommandLineFeature<{
  anyCLIparamsHere: string;
}> {
  /**
   * When you execute: `$ cli version`
   */
  public _() {
    console.log(`Hello world from version argument`);
    this._exit();
  }

  /**
   * When you execute: `$ cli version:getFromPackageJson`
   */
  public getFromPackageJson() {
    const ver = UtilsJson.getValue(
      this.project.pathFor('package.json'),
      'version',
      {
        defaultValue: '<not defined>',
      },
    );
    console.log(`Version from packageJson ${ver}`);
    this._exit(0);
  }
}
//#endregion

/**
 *
 * @param argsv process.argsv
 * @param filename needed if you want ipc communicaiton
 */
export async function startCli(
  argsv: string[],
  filename: string,
): Promise<void> {
  //#region @backendFunc
  console.log('Hello from cli');
  console.log({ argsv });
  process.exit(0); // comment this to use BaseStartConfig and class based cli

  //#region start config
  new BaseStartConfig({
    ProjectClass: BaseProject,
    functionsOrClasses: [
      {
        classOrFnName: '', // registerd as global (only 1 class can be like this)
        funcOrClass: $Global,
      },
      {
        classOrFnName: '$Version',
        funcOrClass: $Version,
      },
    ],
    argsv,
    useStringArrForArgsFunctions: true,
    shortArgsReplaceConfig: {
      v: 'version',
    },
    callbackNotRecognizedCommand: async () => {
      Helpers.error(`Command not recognized`, false, true);
    },
  });
  //#endregion
  //#endregion
}

export default startCli;
