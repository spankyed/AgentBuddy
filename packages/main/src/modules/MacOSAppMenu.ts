import {Menu, app} from 'electron';
import type {AppModule} from '../AppModule.js';
import type {ModuleContext} from '../ModuleContext.js';

/**
 * On macOS, override the default application menu so that Cmd+Q
 * hides the app instead of quitting it.
 */
class MacOSAppMenu implements AppModule {
  async enable({app: electronApp}: ModuleContext): Promise<void> {
    if (process.platform !== 'darwin') return;

    await electronApp.whenReady();

    const appName = electronApp.getName();

    const template: Electron.MenuItemConstructorOptions[] = [
      {
        label: appName,
        submenu: [
          {role: 'about'},
          {type: 'separator'},
          {role: 'services'},
          {type: 'separator'},
          {
            label: `Hide ${appName}`,
            accelerator: 'CommandOrControl+Q',
            click: () => app.hide(),
          },
          {role: 'hide', accelerator: 'CommandOrControl+H'},
          {role: 'hideOthers'},
          {role: 'unhide'},
          {type: 'separator'},
          {
            label: 'Quit',
            accelerator: 'CommandOrControl+Shift+Q',
            click: () => app.quit(),
          },
        ],
      },
      {role: 'editMenu'},
      {
        label: 'View',
        submenu: [
          {role: 'toggleDevTools'},
          {type: 'separator'},
          {role: 'resetZoom'},
          {role: 'zoomIn'},
          {role: 'zoomOut'},
          {type: 'separator'},
          {role: 'togglefullscreen'},
        ],
      },
      {role: 'windowMenu'},
    ];

    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  }
}

export function createMacOSAppMenu() {
  return new MacOSAppMenu();
}
