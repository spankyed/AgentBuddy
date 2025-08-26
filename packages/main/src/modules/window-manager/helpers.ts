import { BrowserWindow } from 'electron';
import { WINDOW_CONFIG } from './constants.js';

export function isMainWindow(window: BrowserWindow): boolean {
  return window.getTitle() === WINDOW_CONFIG.MAIN_TITLE;
}

export function findMainWindow(): BrowserWindow | undefined {
  return BrowserWindow.getAllWindows().find(w => 
    !w.isDestroyed() && isMainWindow(w)
  );
}

export function getWindowIcon(): string {
  const { join } = require('node:path');
  const iconName = process.platform === 'win32' ? 'icon.ico' : 
                   process.platform === 'darwin' ? 'icon.icns' : 'icon.png';
  return join(process.cwd(), 'buildResources', iconName);
}