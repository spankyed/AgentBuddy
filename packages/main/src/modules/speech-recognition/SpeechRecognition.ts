import { ipcMain, app, BrowserWindow } from 'electron';
import type { AppModule } from '../../AppModule.js';
import type { SpeechEvent } from './protocol.js';
import { SpeechHelperProcess } from './SpeechHelperProcess.js';

function broadcastSpeechEvent(event: SpeechEvent): void {
  BrowserWindow.getAllWindows().forEach(window => {
    window.webContents.send('speech:event', event);
  });
}

export function createSpeechRecognition(): AppModule {
  let helper: SpeechHelperProcess | null = null;

  return {
    enable() {
      ipcMain.handle('speech:isAvailable', () => {
        return { available: SpeechHelperProcess.isAvailable() };
      });

      ipcMain.handle('speech:start', async (_event, lang?: string) => {
        // Lazy spawn: only start helper on first use
        if (!helper) {
          helper = new SpeechHelperProcess(broadcastSpeechEvent);
          try {
            await helper.spawn();
          } catch (err) {
            console.error('[SpeechRecognition] Failed to spawn helper:', err);
            helper = null;
            broadcastSpeechEvent({
              event: 'error',
              code: 'spawn_failed',
              message: err instanceof Error ? err.message : 'Failed to start speech helper',
            });
            return;
          }
        }

        helper.sendCommand({ command: 'start', lang });
      });

      ipcMain.handle('speech:stop', () => {
        if (helper?.isRunning()) {
          helper.sendCommand({ command: 'stop' });
        }
      });

      app.on('before-quit', () => {
        if (helper) {
          helper.kill();
          helper = null;
        }
      });
    },
  };
}
