import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, vi } from 'vitest';
import { vueRuntimePack } from './frontend-pack.ts';
import { filesUnder } from '../../src/build/phase-cache.ts';

export function createFrontendResourceFixture() {
  let root: string | undefined;
  afterEach(() => {
    vi.unstubAllEnvs(); vi.restoreAllMocks();
    if (root) fs.rmSync(root, { recursive: true, force: true });
    root = undefined;
  });
  return {
    consumer() {
      root = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-frontend-resources-'));
      return vueRuntimePack(root);
    },
    get root() {
      if (!root) throw new Error('Create the frontend consumer before reading its directory');
      return root;
    },
  };
}

export function readFrontendOutput(pack: string, extension: string): string {
  const directory = path.join(pack, 'dist/runtime');
  return filesUnder(directory).filter(file => file.endsWith(extension))
    .map(file => fs.readFileSync(path.join(directory, file), 'utf8')).join('\n');
}
