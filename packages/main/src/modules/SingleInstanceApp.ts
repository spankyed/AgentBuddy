import {AppModule} from '../AppModule.js';
import * as Electron from 'electron';

class SingleInstanceApp implements AppModule {
  enable({app}: {app: Electron.App}): void {
    // Separate lock namespace so dev, production, and test can coexist
    if (process.env.PLAYWRIGHT_TEST === 'true') {
      app.setName(`${app.getName()}-test`);
    } else if (!app.isPackaged) {
      app.setName(`${app.getName()}-dev`);
    }

    const isSingleInstance = app.requestSingleInstanceLock();
    if (!isSingleInstance) {
      console.log(`[MAIN] Another ${app.isPackaged ? 'production' : 'dev'} instance is already running. Exiting.`);
      app.quit();
      process.exit(0);
    }
  }
}


export function disallowMultipleAppInstance(...args: ConstructorParameters<typeof SingleInstanceApp>) {
  return new SingleInstanceApp(...args);
}
