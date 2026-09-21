import {AppModule} from '../AppModule.js';
import * as Electron from 'electron';
import {publishRunningApp} from '@abuddy/host/database';
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

    // This process is using the data dir from here on, and `abuddy db` refuses to write to one an app is
    // using. Its API publishes a port only once it has booted, and publishes none while a crashed one is
    // being restarted, so between those moments this is the only thing that says the app is here.
    const stopPublishing = publishRunningApp(getAppContext().userDataDir);
    app.once('will-quit', stopPublishing);
  }
}


export function disallowMultipleAppInstance(...args: ConstructorParameters<typeof SingleInstanceApp>) {
  return new SingleInstanceApp(...args);
}
