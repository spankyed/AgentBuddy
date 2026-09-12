import {AppModule} from '../AppModule.js';
import * as Electron from 'electron';

declare const __ABUDDY_CHANNEL__: string;
type AppEnvSuffix = 'dev' | 'test' | 'beta';

function resolveAppSuffix(isPackaged: boolean): AppEnvSuffix | null {
  if (process.env.PLAYWRIGHT_TEST === 'true') return 'test';
  if (__ABUDDY_CHANNEL__ === 'beta' || process.env.ABUDDY_ENV === 'beta') return 'beta';
  if (!isPackaged) return 'dev';
  return null;
}

class SingleInstanceApp implements AppModule {
  enable({app}: {app: Electron.App}): void {
    const suffix = resolveAppSuffix(app.isPackaged);
    if (suffix) {
      app.setName(`${app.getName()}-${suffix}`);
    }

    const isSingleInstance = app.requestSingleInstanceLock();
    if (!isSingleInstance) {
      console.log(`[MAIN] Another ${suffix} instance is already running. Exiting.`);
      app.quit();
      process.exit(0);
    }
  }
}


export function disallowMultipleAppInstance(...args: ConstructorParameters<typeof SingleInstanceApp>) {
  return new SingleInstanceApp(...args);
}
