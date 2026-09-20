// Electron's `app`, as much of it as the main process's own modules use. A test asks for the module under
// test, not for Electron, so the parts that talk to a running browser process stand in as recorded calls.
export const app = {
  isPackaged: false,
  name: 'abuddy',
  paths: new Map<string, string>(),
  setNameCalls: [] as string[],
  setName(name: string) {
    this.name = name;
    this.setNameCalls.push(name);
  },
  setPath(key: string, value: string) {
    this.paths.set(key, value);
  },
  getPath(key: string): string {
    // What Electron answers before anything overrides it: the platform's directory for this app name
    return this.paths.get(key) ?? `/platform/${key}/${this.name}`;
  },
  getVersion: () => '0.0.0-test',
};

/** Puts `app` back as a fresh Electron would hand it over, between tests. */
export function resetElectronStub(): void {
  app.isPackaged = false;
  app.name = 'abuddy';
  app.paths.clear();
  app.setNameCalls.length = 0;
}

export const ipcMain = { handle: () => {}, on: () => {} };
export const shell = { showItemInFolder: () => {} };
