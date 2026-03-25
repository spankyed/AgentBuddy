import type {AppModule} from './AppModule.js';
import type {ModuleContext} from './ModuleContext.js';
import {session} from 'electron';

class MicrophonePermissionModule implements AppModule {
  enable(_context: ModuleContext): void {
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
      if (permission === 'media') {
        callback(true);
        return;
      }
      callback(false);
    });
  }
}

export function grantMicrophonePermission(): MicrophonePermissionModule {
  return new MicrophonePermissionModule();
}
