import type {AppInitConfig} from './AppInitConfig.js';
import {createModuleRunner} from './ModuleRunner.js';
import {disallowMultipleAppInstance} from './modules/SingleInstanceApp.js';
import {createWindowManagerModule} from './modules/window-manager/index.js';
import {terminateAppOnLastWindowClose} from './modules/ApplicationTerminatorOnLastWindowClose.js';
import {hardwareAccelerationMode} from './modules/HardwareAccelerationModule.js';
// import {autoUpdater} from './modules/AutoUpdater.js';
import {allowInternalOrigins} from './modules/BlockNotAllowdOrigins.js';
import {allowExternalUrls} from './modules/ExternalUrls.js';
import {createApiServer} from './modules/api-server/ApiServer.js';
import {createSplashScreen} from './modules/splash-screen/index.js';
import {createMediaProtocol} from './modules/media-protocol/index.js';
import {createSpeechRecognition} from './modules/speech-recognition/index.js';
import {createMacOSAppMenu} from './modules/MacOSAppMenu.js';
import {createBrowserModule} from './modules/browser/index.js';
import {app} from 'electron';


export async function initApp(initConfig: AppInitConfig) {
  // Disable Chromium media features that trigger macOS Apple Music permission prompt
  app.commandLine.appendSwitch('disable-features', 'MediaSessionService,HardwareMediaKeyHandling');

  // Create instances that need to be shared between modules
  const apiServer = createApiServer();
  const splashScreen = createSplashScreen();

  const moduleRunner = createModuleRunner()
    .init(disallowMultipleAppInstance())
    .init(hardwareAccelerationMode({enable: false}))
    .init(createMediaProtocol())  // Must register protocol schemes before app ready
    .init(splashScreen)  // Show splash screen early
    .init(apiServer)
    .init(createSpeechRecognition())
    // .init(createWindowManagerModule({initConfig, openDevTools: import.meta.env.DEV}))
    .init(createWindowManagerModule({initConfig, openDevTools: false, apiServer, splashScreen}))
    .init(terminateAppOnLastWindowClose())
    .init(createBrowserModule())
    .init(createMacOSAppMenu())
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
            'https://www.typescriptlang.org',
            'https://vuejs.org',
            'https://www.postandcourier.com',
            'https://discord.gg',
            // API provider URLs
            'https://console.anthropic.com',
            'https://platform.openai.com',
            'https://aistudio.google.com',
            'https://console.groq.com',
            'https://console.mistral.ai',
            'https://dashboard.cohere.com',
            // XState visualization
            'https://stately.ai',
          ]
          : [],
      )),
    );

  await moduleRunner;
}
