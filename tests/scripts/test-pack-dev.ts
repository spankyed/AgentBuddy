// A real CLI supervisor, watcher, API installer and frontend; disposable runners only.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { chromium, expect, type Browser } from '@playwright/test';
import { sessionFile } from '@apackdev/host/dev-session';
import { resolveAppEnvironment } from '@apackdev/sdk/env';
import { assertCompilerTestRunner } from '../../packages/apack-cli/tests/_support/compiler-test-runner.ts';

assertCompilerTestRunner();
const root = path.resolve(import.meta.dirname, '../..');
const pack = path.join(root, 'tests/packs/external-pack');
const manifestFile = path.join(pack, 'apack.json');
const original = fs.readFileSync(manifestFile, 'utf8');
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-pack-dev-acceptance-'));
const output = path.join(root, '.apack/tests/results/pack-dev.log');
fs.mkdirSync(path.dirname(output), { recursive: true });
const log = fs.createWriteStream(output);
const child = spawn(process.execPath, [path.join(root, 'packages/apack-cli/bin/apack.mjs'), 'pack', 'dev', '--host', root], {
  cwd: pack, env: { ...process.env, APACK_USER_DATA_DIR: userDataDir }, stdio: ['ignore', 'pipe', 'pipe'],
});
let text = '';
for (const stream of [child.stdout, child.stderr]) stream.on('data', data => {
  text += String(data);
  log.write(data);
  process.stdout.write(data);
});
// Register before signalling; even a fast successful exit must be observed.
const closed = once(child, 'close');
let browser: Browser | undefined;
try {
  await expect.poll(() => {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error(`pack dev exited early: ${text}`);
    return text.includes('[watch] Watching build inputs');
  // The same fixture's cold build took 153s on the two-core runner. Startup also owns
  // a retained frontend compiler and app launch; it is not a single 60s readiness event.
  }, { timeout: 300_000, message: 'cold build, frontend compiler, app launch, install and watcher startup' }).toBe(true);
  const session = JSON.parse(fs.readFileSync(sessionFile(userDataDir), 'utf8'));
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${session.debugPort}`, { timeout: 15_000 });
  const page = browser.contexts()[0]!.pages().find(page => page.url().includes('/renderer/dist/index.html'))!;
  expect(page, 'the app renderer is available over its development session').toBeTruthy();
  const runtime = () => page.evaluate(() => (window as any).applicationState?.getSnapshot().context.acceptedPackRuntimes['e2e-fixture']);
  await expect.poll(runtime, { timeout: 30_000 }).toBeTruthy();
  const previous = await runtime();
  const manifest = JSON.parse(original);
  manifest.features.memos.settings.defaults.listTitle = 'CLI rebuild memos';
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
  const installed = path.join(resolveAppEnvironment({ env: 'development', userDataDir }).packsDir, manifest.id, 'apack.json');
  // The retained generation's preceding build took 109s on this runner. Bound compilation/install
  // separately from frontend acknowledgment, so a missing delivery still fails within 30s.
  await expect.poll(() => {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error(`pack dev exited during rebuild: ${text}`);
    try { return JSON.parse(fs.readFileSync(installed, 'utf8')).features.memos.settings.defaults.listTitle; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }, { timeout: 180_000, message: 'watcher rebuilds and installs the changed declaration' }).toBe('CLI rebuild memos');
  await expect.poll(async () => {
    const current = await runtime();
    return !!current && current !== previous;
  }, { timeout: 30_000, message: 'installed rebuild accepted by the running frontend' }).toBe(true);
  expect(JSON.parse(fs.readFileSync(installed, 'utf8')).features.memos.settings.defaults.listTitle).toBe('CLI rebuild memos');
  console.log('PASS: source pack dev initially installs, watches a manifest edit, and delivers a new accepted runtime');
} finally {
  try { await browser?.close(); }
  finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    try {
      await Promise.race([closed, new Promise<never>((_, reject) => {
        const timer = setTimeout(() => reject(new Error(`pack dev cleanup exceeded 15s; see ${output}`)), 15_000);
        timer.unref();
      })]);
    } finally {
      log.end();
      fs.writeFileSync(manifestFile, original);
      // A failed cleanup retains its private data for evidence; never remove a running app's database.
      if (child.exitCode !== null || child.signalCode !== null) fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  }
}
