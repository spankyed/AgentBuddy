import {AppModule} from '../AppModule.js';
import * as Electron from 'electron';
import {getAppContext} from '../app-context.js';

class SingleInstanceApp implements AppModule {
  enable({app}: {app: Electron.App}): void {
    // App name and userData are set by initAppContext(); the lock is scoped to them
    const isSingleInstance = app.requestSingleInstanceLock();
    if (!isSingleInstance) {
      console.log(`[MAIN] Another ${getAppContext().env} instance is already running. Exiting.`);
      app.quit();
      process.exit(0);
    }
  }
}


export function disallowMultipleAppInstance(...args: ConstructorParameters<typeof SingleInstanceApp>) {
  return new SingleInstanceApp(...args);
}
