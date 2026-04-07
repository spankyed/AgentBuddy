import type {AppModule} from '../AppModule.js';
import type {ModuleContext} from '../ModuleContext.js';
import {autoUpdater} from 'electron-updater';
import {ipcMain} from 'electron';
import {broadcastEvent} from './api-server/process-manager.js';

const UPDATE_CHECK_INTERVAL = 4 * 60 * 60 * 1000; // 4 hours

export class AutoUpdater implements AppModule {
  private dismissedVersion: string | null = null;

  enable({app}: ModuleContext): void {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowDowngrade = false;

    // Forward events to renderer
    autoUpdater.on('update-available', (info) => {
      if (this.dismissedVersion === info.version) return;
      broadcastEvent('update:available', info);
    });

    autoUpdater.on('download-progress', (progress) => {
      broadcastEvent('update:download-progress', progress);
    });

    autoUpdater.on('update-downloaded', (info) => {
      broadcastEvent('update:downloaded', info);
    });

    autoUpdater.on('error', (err) => {
      broadcastEvent('update:error', err.message);
    });

    // IPC handlers
    ipcMain.handle('update:start-download', () => {
      return autoUpdater.downloadUpdate();
    });

    ipcMain.handle('update:install', () => {
      autoUpdater.quitAndInstall();
    });

    ipcMain.handle('update:dismiss', (_event, version?: string) => {
      if (version) {
        this.dismissedVersion = version;
      }
    });

    // Check on launch, then periodically
    app.whenReady().then(() => {
      autoUpdater.checkForUpdates().catch(() => {});
      setInterval(() => {
        autoUpdater.checkForUpdates().catch(() => {});
      }, UPDATE_CHECK_INTERVAL);
    });
  }
}

export function createAutoUpdater(): AutoUpdater {
  return new AutoUpdater();
}
