import type {AppInitConfig} from './AppInitConfig.js';
import {createModuleRunner} from './ModuleRunner.js';
import {disallowMultipleAppInstance} from './modules/SingleInstanceApp.js';
import {createWindowManagerModule} from './modules/WindowManager.js';
import {terminateAppOnLastWindowClose} from './modules/ApplicationTerminatorOnLastWindowClose.js';
import {hardwareAccelerationMode} from './modules/HardwareAccelerationModule.js';
// import {autoUpdater} from './modules/AutoUpdater.js';
import {allowInternalOrigins} from './modules/BlockNotAllowdOrigins.js';
import {allowExternalUrls} from './modules/ExternalUrls.js';
import {createApiServer} from './modules/ApiServer.js';


export async function initApp(initConfig: AppInitConfig) {
  // Create API server instance first so we can wait for it
  const apiServer = createApiServer();
  
  const moduleRunner = createModuleRunner()
    .init(disallowMultipleAppInstance())
    .init(hardwareAccelerationMode({enable: false}))
    .init(apiServer)
    // .init(createWindowManagerModule({initConfig, openDevTools: import.meta.env.DEV}))
    .init(createWindowManagerModule({initConfig, openDevTools: false, apiServer}))
    .init(terminateAppOnLastWindowClose())
    // Disable auto-updater until GitHub releases are configured
    // .init(autoUpdater())

    // Install DevTools extension if needed
    // .init(chromeDevToolsExtension({extension: 'VUEJS3_DEVTOOLS'}))

    // Security
    .init(allowInternalOrigins(
      new Set(initConfig.renderer instanceof URL ? [initConfig.renderer.origin] : []),
    ))
    .init(allowExternalUrls(
      new Set(
        initConfig.renderer instanceof URL
          ? [
            'https://vite.dev',
            'https://developer.mozilla.org',
            'https://solidjs.com',
            'https://qwik.dev',
            'https://lit.dev',
            'https://react.dev',
            'https://preactjs.com',
            'https://www.typescriptlang.org',
            'https://vuejs.org',
          ]
          : [],
      )),
    );

  await moduleRunner;
}
