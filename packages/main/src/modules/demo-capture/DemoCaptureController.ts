import type {AppModule} from '../../AppModule.js';
import type {AppInitConfig} from '../../AppInitConfig.js';
import {BrowserWindow, app, ipcMain} from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';

type DemoCaptureConfig = NonNullable<AppInitConfig['demoCapture']>;

const CAPTURE_STABILIZATION_MS = 150;

class DemoCaptureController implements AppModule {
  readonly #config?: DemoCaptureConfig;
  #captured = false;

  constructor(config?: DemoCaptureConfig) {
    this.#config = config;
  }

  enable(): void {
    if (!this.#config?.enabled) return;

    ipcMain.handle('demo:ready', async (event) => {
      if (this.#captured) return;
      this.#captured = true;

      const window = BrowserWindow.fromWebContents(event.sender);
      if (!window) {
        throw new Error('Unable to resolve BrowserWindow for demo capture.');
      }

      await this.#capture(window);
    });
  }

  async #capture(window: BrowserWindow): Promise<void> {
    if (!this.#config) return;

    await new Promise(resolve => setTimeout(resolve, CAPTURE_STABILIZATION_MS));

    const image = await window.webContents.capturePage();
    const outputPath = path.resolve(this.#config.captureOutput);

    await fs.mkdir(path.dirname(outputPath), {recursive: true});
    await fs.writeFile(outputPath, image.toPNG());

    console.log(`[DEMO] Captured ${this.#config.id}/${this.#config.scene} to ${outputPath}`);
    app.exit(0);
  }
}

export function createDemoCaptureModule(config?: DemoCaptureConfig) {
  return new DemoCaptureController(config);
}
