import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import type { Page } from 'playwright-core';
import { createAppDriver } from '@apackdev/testing';
import { defineDriveConfig, definePackE2EConfig } from '@apackdev/testing/playwright';
import { packInputsHash } from '@apackdev/host/build/pack-inputs';

const roots: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

it('keeps helper-generated test and drive output out of the authored input identity', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-run-inputs-'));
  roots.push(root);
  const source = path.join(root, 'module.ts');
  fs.writeFileSync(source, 'export const value = 1;');
  const authored = packInputsHash(root);
  vi.stubEnv('PACK_DIR', root);
  vi.stubEnv('E2E_REPORT_DIR', undefined);
  const screenshot = vi.fn<Page['screenshot']>(async options => {
    if (!options?.path) throw new Error('The driver must supply a screenshot path');
    fs.writeFileSync(options.path, 'screenshot bytes');
    return Buffer.from('screenshot bytes');
  });
  const app = createAppDriver({ screenshot } as unknown as Page, path.join(root, '.apack/tests/screenshots'));
  await app.screenshot('view');
  const report = await app.report('state', { ready: true });
  expect(JSON.parse(fs.readFileSync(report, 'utf8'))).toEqual({ ready: true });
  for (const [directory, config] of [[root, definePackE2EConfig()], [path.join(root, 'drive'), defineDriveConfig()]] as const) {
    const output = path.resolve(directory, config.outputDir!);
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(path.join(output, 'app-0.log'), 'run output');
  }
  expect(packInputsHash(root)).toBe(authored);

  fs.writeFileSync(source, 'export const value = 2;');
  expect(packInputsHash(root)).not.toBe(authored);
});
