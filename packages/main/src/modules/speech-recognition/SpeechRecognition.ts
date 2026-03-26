import { ipcMain, app, type WebContents } from 'electron';
import type { AppModule } from '../../AppModule.js';
import type { SpeechEvent } from './protocol.js';
import { SpeechHelperProcess } from './SpeechHelperProcess.js';

export function createSpeechRecognition(): AppModule {
  let helper: SpeechHelperProcess | null = null;
  let spawnPromise: Promise<SpeechHelperProcess> | null = null;
  let activeWebContents: WebContents | null = null;

  const emit = (event: SpeechEvent) => {
    if (activeWebContents && !activeWebContents.isDestroyed()) {
      activeWebContents.send('speech:event', event);
    }
  };

  // Dedup concurrent calls: all callers share the same spawn promise until the helper is ready.
  async function ensureHelper(): Promise<SpeechHelperProcess> {
    if (helper?.isRunning()) return helper;
    if (spawnPromise) return spawnPromise;
    const h = new SpeechHelperProcess(emit);
    spawnPromise = h.spawn().then(() => {
      helper = h;
      return h;
    }).finally(() => {
      spawnPromise = null;
    });
    return spawnPromise;
  }

  return {
    enable() {
      ipcMain.handle('speech:isAvailable', () => ({
        available: SpeechHelperProcess.isAvailable(),
      }));

      ipcMain.handle('speech:start', async (_event, lang?: string) => {
        activeWebContents = _event.sender;
        try {
          helper = await ensureHelper();
        } catch (err) {
          console.error('[SpeechRecognition] Failed to spawn helper:', err);
          helper = null;
          emit({
            event: 'error',
            code: 'spawn_failed',
            message: err instanceof Error ? err.message : 'Failed to start speech helper',
          });
          return;
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
