import {AppModule} from '../AppModule.ts';
import * as Electron from 'electron';
import {publishRunningApp} from '@abuddy/host/database';
import {getAppContext} from '../app-context.ts';

class SingleInstanceApp implements AppModule {
  enable({app}: {app: Electron.App}): void {
    // **The lock is scoped by the data dir, not by the app name.** Chromium's ProcessSingleton puts it
    // there — a `SingletonLock` symlink naming `<hostname>-<pid>`, beside `SingletonCookie` and
    // `SingletonSocket` — so what decides it is `app.setPath('userData')` and nothing else.
    // Observed 2026-10-09: two apps of one name on different data dirs both take it; two of different
    // names on one data dir, and the second is refused. So four environments run side by side because
    // their dirs differ, and a profile is what lets two of one environment coexist.
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
