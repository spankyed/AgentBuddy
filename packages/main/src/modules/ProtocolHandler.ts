import {BrowserWindow} from 'electron';
import type {AppModule} from '../AppModule.js';
import type {ModuleContext} from '../ModuleContext.js';

class ProtocolHandler implements AppModule {
  enable({app}: ModuleContext): void {
    app.setAsDefaultProtocolClient('abuddy');

    // macOS: URL opened while app is running
    app.on('open-url', (event, url) => {
      event.preventDefault();
      this.#handleProtocolUrl(url);
    });

    // Windows/Linux: URL passed as argv in second-instance
    app.on('second-instance', (_event, argv) => {
      const url = argv.find(a => a.startsWith('abuddy://'));
      if (url) this.#handleProtocolUrl(url);
    });
  }

  #handleProtocolUrl(url: string): void {
    try {
      const parsed = new URL(url);
      const action = parsed.hostname;
      const params = Object.fromEntries(parsed.searchParams);

      console.log(`[ProtocolHandler] ${action}`, params);

      const win = BrowserWindow.getAllWindows().find(w => !w.isDestroyed());
      if (win) {
        if (win.isMinimized()) win.restore();
        win.focus();
        win.webContents.send('protocol-action', {action, params});
      }
    } catch (e) {
      console.error('[ProtocolHandler] Failed to parse URL:', url, e);
    }
  }
}

export function createProtocolHandler() {
  return new ProtocolHandler();
}
