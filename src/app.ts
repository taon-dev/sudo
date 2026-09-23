//#region imports
import * as os from 'os'; // @backend

import { AsyncPipe, JsonPipe, NgFor } from '@angular/common'; // @browser
import {
  inject,
  Injectable,
  APP_INITIALIZER,
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  isDevMode,
  mergeApplicationConfig,
  provideZonelessChangeDetection,
  signal,
} from '@angular/core'; // @browser
import { Component } from '@angular/core'; // @browser
import { VERSION, OnInit } from '@angular/core'; // @browser
import { toSignal } from '@angular/core/rxjs-interop'; // @browser
import { MatButtonModule } from '@angular/material/button'; // @browser
import { MatCardModule } from '@angular/material/card'; // @browser
import { MatDialog } from '@angular/material/dialog'; // @browser
import { MatDividerModule } from '@angular/material/divider'; // @browser
import { MatIconModule } from '@angular/material/icon'; // @browser
import { MatListModule } from '@angular/material/list'; // @browser
import { MatTabsModule } from '@angular/material/tabs'; // @browser
import {
  provideClientHydration,
  withEventReplay,
} from '@angular/platform-browser';
import {
  provideRouter,
  Router,
  RouterLinkActive,
  RouterModule,
  RouterOutlet,
  ActivatedRoute,
  Routes,
  Route,
  withHashLocation,
  withComponentInputBinding,
} from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { RenderMode, ServerRoute } from '@angular/ssr';
import Aura from '@primeng/themes/aura'; // @browser
import { Translation, TranslationManager } from '@taon-dev/i18n/src';
// TranslationManager.globalDefautlLanguageOverride = 'pl-PL';
import { TranslateDirective } from '@taon-dev/i18n/src'; // @browser
import { providePrimeNG } from 'primeng/config'; // @browser
import { BehaviorSubject, Observable, map, switchMap } from 'rxjs';
import {
  Taon,
  TaonBaseContext,
  TAON_CONTEXT,
  EndpointContext,
  TaonBaseAngularService,
  TaonEntity,
  StringColumn,
  TaonBaseAbstractEntity,
  TaonBaseCrudController,
  TaonController,
  GET,
  TaonMigration,
  TaonBaseMigration,
  TaonContext,
} from 'taon/src';
import { TaonAdminService, TaonAdmin } from 'taon/src'; // @browser
import { TaonStor } from 'taon-storage/src';
import {
  TaonAdminModeConfigurationComponent,
  TaonNotFoundComponent,
  TaonSettingsComponent,
  TaonThemeComponent,
  TaonThemeService,
} from 'taon-ui/src'; // @browser
import { Utils, UtilsOs } from 'tnp-core/src';

import { HOST_CONFIG } from './app.hosts';
import { ENV_ANGULAR_NODE_APP_BUILD_PWA_DISABLE_SERVICE_WORKER } from './lib/env/env.angular-node-app';
// @placeholder-for-imports

//#endregion

//#region constants
console.log('🚀 [ TAON IS STARTING ]');
const t = Translation.for(Taon.__FILE_RELATIVE_PATH, Taon.LANG_IMPORT_MAP, {
  // debug: true
});
//#endregion

//#region sudo component
//#region @browser
@Component({
  selector: 'app-root',

  imports: [
    // RouterOutlet,
    AsyncPipe,
    MatCardModule,
    MatIconModule,
    MatDividerModule,
    MatButtonModule,
    MatListModule,
    MatTabsModule,
    RouterModule,
    TranslateDirective,
    TaonAdminModeConfigurationComponent,
    JsonPipe,
  ],
  // // Uncomment to have simples template
  // template: `
  //   @if (itemsLoaded()) {
  //     <router-outlet />
  //   }
  // `,
  template: `
    <taon-admin-mode-configuration>
      @if (itemsLoaded()) {
        @if (navItems.length > 0) {
          <nav
            mat-tab-nav-bar
            class="shadow-1"
            [tabPanel]="tabPanel">
            @for (item of navItems; track item.path) {
              <a
                mat-tab-link
                href="javascript:void(0)"
                [style.text-decoration]="
                  (activePath === item.path && !forceShowBaseRootApp) ||
                  ('/' === item.path && forceShowBaseRootApp)
                    ? 'underline'
                    : 'none'
                "
                (click)="navigateTo(item)">
                @if (item.path === '/') {
                  <mat-icon
                    aria-hidden="false"
                    aria-label="Example home icon"
                    fontIcon="home"></mat-icon>
                } @else {
                  {{ item.label }}
                }
              </a>
            }
            <a
              mat-tab-link
              href="javascript:void(0)"
              (click)="openSettings(200, 200)">
              <mat-icon>settings</mat-icon>
            </a>
          </nav>

          <mat-tab-nav-panel #tabPanel>
            @if (!forceShowBaseRootApp) {
              <router-outlet />
            }
          </mat-tab-nav-panel>
        }
        @if (navItems.length === 0) {
          <nav class="shadow-1 w-full p-2">
            <button
              mat-icon-button
              (click)="openDialog(200, 200)">
              <mat-icon>settings</mat-icon>
            </button>
          </nav>
        }

        @if (navItems.length === 0 || forceShowBaseRootApp) {
          <mat-card class="m-2">
            <mat-card-content>
              <h3>{{ t.gettext('Basic app info') }}</h3>
              {{ t.gettext('Name') }}: sudo<br />
              {{ t.gettext('Angular version:') }} {{ angularVersion }}<br />
              {{ t.gettext('Taon backend:') }} {{ taonMode }}<br />
            </mat-card-content>
          </mat-card>

          <mat-card class="m-2">
            <mat-card-content>
              <h3>{{ exampleUserTitle() }}</h3>
              <ul>
                @for (user of users(); track user.id) {
                  <li class="p-1">
                    {{ user | json }}
                    <button
                      mat-flat-button
                      (click)="deleteUser(user)">
                      <mat-icon>delete user</mat-icon>
                    </button>
                  </li>
                }
              </ul>
              <br />
              <button
                class="ml-1"
                matButton="outlined"
                (click)="addUser()">
                {{ t.gettext('Add new example user with random name') }}
              </button>
            </mat-card-content>
          </mat-card>

          <mat-card class="m-2">
            <mat-card-content>
              <h3 translate>Example hello world from backend API:</h3>
              {{ t.gettext('hello world from backend:') }}
              <strong>{{ hello$ | async }}</strong>
            </mat-card-content>
          </mat-card>
        }
        <footer
          class="text-center p-4 w-full select-none"
          (click)="taonAdminService.enableDeveloperIf5Timetap()">
          {{ t.gettext('Copyright') }} <strong>sudo</strong>
          {{ year }}
        </footer>
      }
    </taon-admin-mode-configuration>
  `,
})
export class SudoApp implements OnInit {
  t = t.for(this);

  exampleUserTitle = this.t.signal.gettext('Example users from backend API:');

  /**Required for proper theme*/
  theme = inject(TaonThemeService);

  taonAdminService = inject(TaonAdminService);

  dialog = inject(MatDialog);

  activatedRoute = inject(ActivatedRoute);

  userApiService = inject(UserApiService);

  router = inject(Router);

  itemsLoaded = signal(false);

  year = new Date().getFullYear();

  taonMode = UtilsOs.isRunningInWebSQL() ? 'websql' : 'normal nodejs';

  angularVersion = VERSION.full;

  forceShowBaseRootApp = false;

  private refresh = new BehaviorSubject<void>(undefined);

  get activePath(): string {
    return globalThis?.location.pathname?.split('?')[0];
  }

  navItems =
    SudoClientRoutes.length <= 1
      ? []
      : SudoClientRoutes.filter(r => r.path !== undefined).map(r => ({
          path: r.path === '' ? '/' : `/${r.path}`,
          label: r.path === '' ? 'Home' : `${r.path}`,
        }));

  readonly hello$ = this.userApiService.userController
    .helloWorld()
    .request()
    .observable.pipe(map(r => r.body.text));

  openDialog(
    enterAnimationDuration: string | number,
    exitAnimationDuration: string | number,
  ): void {
    this.dialog.open(TaonSettingsComponent, {
      width: '400px',
      enterAnimationDuration,
      exitAnimationDuration,
    });
  }

  ngOnInit(): void {
    //Called after the constructor, initializing input properties, and the first call to ngOnChanges.
    //Add 'implements OnInit' to the class.
    console.log(globalThis?.location.pathname);
    // TODO set below from 1000 to zero in production
    void Taon.removeLoader(1000).then(() => {
      this.itemsLoaded.set(true);
    });
  }

  readonly users = toSignal(
    this.refresh.pipe(
      switchMap(() =>
        this.userApiService.userController
          .getAll()
          .request()
          .observable.pipe(map(r => r.body.json)),
      ),
    ),
    { initialValue: [] },
  );

  async deleteUser(userToDelete: User): Promise<void> {
    await this.userApiService.userController
      .deleteById(userToDelete.id)
      .request();
    this.refresh.next();
  }

  async addUser(): Promise<void> {
    const newUser = new User();
    newUser.name = `user-${Math.floor(Math.random() * 1000)}`;
    await this.userApiService.userController.save(newUser).request();
    this.refresh.next();
  }

  navigateTo(item: { path: string; label: string }): void {
    if (item.path === '/') {
      if (this.forceShowBaseRootApp) {
        return;
      }
      this.forceShowBaseRootApp = true;
      return;
    }
    this.forceShowBaseRootApp = false;
    void this.router.navigateByUrl(item.path);
  }
}
//#endregion
//#endregion

//#region  sudo api service

//#region @browser
@Injectable({
  providedIn: 'root',
})
export class UserApiService extends TaonBaseAngularService {
  userController = this.injectController(UserController);

  getAll(): Observable<User[]> {
    return this.userController
      .getAll()
      .request()
      .observable.pipe(map(r => r.body.json));
  }
}
//#endregion

//#endregion

//#region  sudo routes
//#region @browser
export const SudoServerRoutes: ServerRoute[] = [
  {
    path: '**',
    renderMode: RenderMode.Prerender,
  },
];
export const SudoClientRoutes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: () => {
      if (SudoClientRoutes.length === 1) {
        return '';
      }
      return SudoClientRoutes.find(r => r.path !== '')!.path!;
    },
  },
  // PUT ALL ROUTES HERE
  // @placeholder-for-routes

  // uncomment this to have NOT FOUND route
  // {
  //   path: '**',
  //   component: TaonNotFoundComponent,
  // },
];
//#endregion
//#endregion

//#region  sudo app configs
//#region @browser
export const SudoAppConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    {
      provide: TAON_CONTEXT,
      useFactory: () => SudoContext,
    },
    providePrimeNG({
      theme: {
        preset: Aura,
      },
    }),
    {
      provide: APP_INITIALIZER,
      multi: true,
      useFactory: () => SudoStartFunction,
    },
    provideBrowserGlobalErrorListeners(),
    // remove withHashLocation() to use SSR
    provideRouter(
      SudoClientRoutes,
      withHashLocation(),
      withComponentInputBinding(),
    ),
    provideClientHydration(withEventReplay()),
    provideServiceWorker('ngsw-worker.js', {
      enabled:
        !isDevMode() && !ENV_ANGULAR_NODE_APP_BUILD_PWA_DISABLE_SERVICE_WORKER,
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};

export const SudoServerConfig: ApplicationConfig = {
  providers: [provideServerRendering(withRoutes(SudoServerRoutes))],
};

export const SudoConfig = mergeApplicationConfig(
  SudoAppConfig,
  SudoServerConfig,
);
//#endregion
//#endregion

//#region  sudo entity
@TaonEntity({ className: 'User' })
class User extends TaonBaseAbstractEntity {
  //#region @websql
  @StringColumn()
  //#endregion
  name?: string;

  getHello(): string {
    return `hello ${this.name}`;
  }
}
//#endregion

//#region  sudo controller
@TaonController({ className: 'UserController' })
class UserController extends TaonBaseCrudController<User> {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  entityClassResolveFn = () => User;

  @GET()
  helloWorld(): Taon.Response<string> {
    //#region @websqlFunc
    return async (req, res) => 'hello world';
    //#endregion
  }

  @GET()
  getOsPlatform(): Taon.Response<string> {
    //#region @websqlFunc
    return async (req, res) => {
      //#region @backend
      return os.platform(); // for normal nodejs backend return real value
      //#endregion

      return 'no-platform-inside-browser-and-websql-mode';
    };
    //#endregion
  }
}
//#endregion

//#region  sudo migration

//#region @websql
@TaonMigration({
  className: 'UserMigration',
})
class UserMigration extends TaonBaseMigration {
  userController = this.injectRepo(User);

  async up(): Promise<any> {
    const superAdmin = new User();
    superAdmin.name = 'super-admin';
    await this.userController.save(superAdmin);
  }
}
//#endregion

//#endregion

//#region  sudo context
var SudoContext = Taon.createContext(() => ({
  ...HOST_CONFIG['SudoContext'],
  contexts: { TaonBaseContext },

  //#region @websql
  /**
   * In production use specyfic for this context name
   * generated migration object from  ./migrations/index.ts.
   */
  migrations: {
    UserMigration,
  },
  //#endregion

  controllers: {
    UserController,
  },
  entities: {
    User,
  },
  database: true,
  disabledRealtime: true,
}));
//#endregion

//#region  sudo start function
export const SudoStartFunction = async (
  startParams?: Taon.StartParams,
): Promise<void> => {
  TranslationManager.Instance.visibleLanguages = ['en-US', 'pl-PL'];
  // await TranslationManager.Instance.changeGlobalLang('en-US');

  // await TranslationManager.Instance.setOneLanguagePernament('en-US')

  //#region @browser
  TaonAdmin.init();
  await TaonStor.awaitAll();
  //#endregion

  await SudoContext.initialize(startParams);

  //#region initialize auto generated active contexts
  const autoGeneratedActiveContextsForApp: TaonContext[] = [
    // @placeholder-for-contexts-init
  ];

  const priorityContexts = [
    // put here manual priority for contexts if needed
  ];

  const activeContextsForApp: TaonContext[] = [
    ...priorityContexts,
    ...autoGeneratedActiveContextsForApp.filter(
      c => !priorityContexts.includes(c),
    ),
  ];

  for (const activeContext of activeContextsForApp) {
    await activeContext.initialize(startParams);
  }
  //#endregion

  //#region @backend
  //#region @esmRemove
  if (
    startParams?.onlyMigrationRun ||
    startParams?.onlyMigrationRevertToTimestamp
  ) {
    process.exit(0);
  }
  //#endregion
  //#endregion

  //#region @backend
  //#region @esmRemove
  console.log(`Hello in NodeJs backend! os=${os.platform()}`);
  //#endregion
  //#endregion
};
//#endregion

//#region default export
export default SudoStartFunction;
//#endregion
