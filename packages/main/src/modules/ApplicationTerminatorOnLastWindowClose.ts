import {AppModule} from '../AppModule.ts';
import {MainModuleScope} from '../MainModuleScope.ts';

class ApplicationTerminatorOnLastWindowClose implements AppModule {
  enable({app}: MainModuleScope): Promise<void> | void {
    app.on('window-all-closed', () => {
      // On macOS, keep the app running when all windows are closed (standard macOS behavior)
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });
  }
}


export function terminateAppOnLastWindowClose(...args: ConstructorParameters<typeof ApplicationTerminatorOnLastWindowClose>) {
  return new ApplicationTerminatorOnLastWindowClose(...args);
}
