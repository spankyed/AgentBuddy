import { ipcMain, app, type WebContents } from 'electron';
import type { AppModule } from '../../AppModule.js';
import type { SpeechEvent } from './protocol.js';
import { SpeechHelperProcess } from './SpeechHelperProcess.js';

function sendSpeechEvent(sender: WebContents | null, event: SpeechEvent): void {
  if (sender && !sender.isDestroyed()) {
    sender.send('speech:event', event);
  }
}

export function createSpeechRecognition(): AppModule {
  let helper: SpeechHelperProcess | null = null;
  let activeWebContents: WebContents | null = null;

  return {
    enable() {
      ipcMain.handle('speech:isAvailable', () => {
        return { available: SpeechHelperProcess.isAvailable() };
      });

      ipcMain.handle('speech:start', async (_event, lang?: string) => {
        activeWebContents = _event.sender;

        // Re-spawn if helper died since last use
        if (helper && !helper.isRunning()) {
          helper = null;
        }

        // Lazy spawn: only start helper on first use
        if (!helper) {
          helper = new SpeechHelperProcess((evt) => sendSpeechEvent(activeWebContents, evt));
          try {
            await helper.spawn();
          } catch (err) {
            console.error('[SpeechRecognition] Failed to spawn helper:', err);
            helper = null;
            sendSpeechEvent(activeWebContents, {
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
        activeWebContents = null;
      });
    },
  };
}
