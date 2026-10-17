import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { BUILD_INPUTS_IPC_ENV, createCompilerWatchRecorder, readCompilerWatchReports } from '../../src/build/build-watch-inputs.ts';

const roots: string[] = [];
afterEach(() => { vi.unstubAllEnvs(); roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })); });

it('retains complete probes through an interrupted append and refuses malformed completed probes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-watch-report-'));
  roots.push(root);
  vi.stubEnv(BUILD_INPUTS_IPC_ENV, '1');
  const record = createCompilerWatchRecorder(root)!;
  record('/outside/value.txt', 'file');
  record('/outside/value.txt', 'file');
  const file = path.join(root, fs.readdirSync(root)[0]!);
  const complete = fs.readFileSync(file, 'utf8');
  fs.appendFileSync(file, '["/incomplete');
  expect(readCompilerWatchReports(root)[0]?.probes).toEqual([['/outside/value.txt', 'file']]);
  fs.writeFileSync(file, complete + '["relative.txt","file"]\n');
  expect(() => readCompilerWatchReports(root)).toThrow('Invalid compiler watch report');
  fs.writeFileSync(file, '["/incomplete');
  expect(readCompilerWatchReports(root)[0]?.probes).toEqual([]);
});

it('does not create a report outside a watched build', () => {
  vi.stubEnv(BUILD_INPUTS_IPC_ENV, '0');
  expect(createCompilerWatchRecorder('/unused')).toBeUndefined();
});
