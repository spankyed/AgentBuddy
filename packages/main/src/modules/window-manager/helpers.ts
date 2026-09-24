import { BrowserWindow, app } from 'electron';
import { join } from 'node:path';
import { WINDOW_CONFIG } from './constants.js';

export function isMainWindow(window: BrowserWindow): boolean {
  return window.getTitle() === WINDOW_CONFIG.MAIN_TITLE;
}

export function findMainWindow(): BrowserWindow | undefined {
  return BrowserWindow.getAllWindows().find(w => 
    !w.isDestroyed() && isMainWindow(w)
  );
}

/**
 * The app icon for this platform, from `build/resources`. Development builds use the
 * `-dev` variant so the dock and taskbar tell a dev run apart from an installed one.
 *
 * Only `icon-dev.png` is checked in, so development always resolves the PNG — Electron
 * accepts a PNG window icon on every platform. Packaged builds get the platform's own
 * format. Pass an extension to override: `app.dock.setIcon` needs a `.png`, never `.icns`.
 */
export function getWindowIcon(extension?: 'png'): string {
  const suffix = app.isPackaged ? '' : '-dev';
  const platformExt = process.platform === 'win32' ? 'ico' : process.platform === 'darwin' ? 'icns' : 'png';
  const ext = extension ?? (app.isPackaged ? platformExt : 'png');
  return join(process.cwd(), 'build', 'resources', `icon${suffix}.${ext}`);
}
