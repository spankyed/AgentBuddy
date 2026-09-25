// `abuddy test --contract`: the pack's vitest, with no app. The point of the flag is what it does *not* do —
// no Playwright, no app download, no `playwright.config.ts` required — so these assert the absences.
//
// In the integration half although every test here injects a recorder and spawns nothing, and runs in ~20ms.
// `suite-split.spec.ts` asks whether an export's implementation reaches a child process, and `contractTest`'s
// default runner is `spawnSync` — true of the export, false of these tests. The predicate is mechanism-based
// rather than cost-based; `docs/plans/test-unit-scheduling.md` records that, and this is an instance of it
// rather than a reason to loosen the guard.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { contractTest, test as runTest, TEST_USAGE } from '../../src/commands/test.ts';

const dirs: string[] = [];
/**
 * A pack outside any checkout, with vitest installed as a pack's own devDependency would be — so
 * `resolveVitestCli` is exercised rather than stubbed, and the fixture does not depend on this repo's
 * hoisted node_modules being reachable from a temp directory (it is not).
 */
function pack(files: Record<string, string> = {}, { vitest = true } = {}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'contract-test-'));
  dirs.push(dir);
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'a-pack' }));
  if (vitest) {
    const installed = path.join(dir, 'node_modules', 'vitest');
    fs.mkdirSync(path.join(installed, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(installed, 'package.json'), JSON.stringify({ name: 'vitest', version: '3.2.4', bin: { vitest: './dist/cli.js' } }));
    fs.writeFileSync(path.join(installed, 'dist', 'cli.js'), '');
  }
  for (const [name, contents] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), contents);
  }
  return dir;
}
afterAll(() => { for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true }); });

/** Records what would have been spawned instead of spawning it */
function recorder(status: number | null = 0) {
  const calls: Array<{ command: string; args: readonly string[]; cwd: string }> = [];
  return { calls, run: (command: string, args: readonly string[], options: { cwd: string }) => (calls.push({ command, args, cwd: options.cwd }), status) };
}

describe('abuddy test --contract', () => {
  it('runs the pack vitest against the pack root', async () => {
    const dir = pack({ 'vitest.config.ts': 'export default {}\n' });
    const spawned = recorder();
    await contractTest(dir, [], spawned.run);
    expect(spawned.calls).toHaveLength(1);
    expect(spawned.calls[0].args.slice(1)).toEqual(['run', '--root', dir]);
    expect(spawned.calls[0].cwd).toBe(dir);
  });

  it('passes the remaining arguments to vitest, without the flag itself', async () => {
    const dir = pack({ 'vitest.config.ts': 'export default {}\n' });
    const spawned = recorder();
    await contractTest(dir, ['-t', 'a case', '--bail', '1'], spawned.run);
    expect(spawned.calls[0].args.slice(1)).toEqual(['run', '--root', dir, '-t', 'a case', '--bail', '1']);
    expect(spawned.calls[0].args).not.toContain('--contract');
  });

  // The routing, from the command's own entry point: --contract must not reach the Playwright path, which
  // would throw about a missing playwright.config.ts before ever looking at the flag
  it('routes there from `test()`, stripping the flag', async () => {
    const dir = pack({ 'vitest.config.ts': 'export default {}\n' });
    const cwd = process.cwd();
    const spawned = recorder();
    try {
      process.chdir(dir);
      await runTest(['--contract', '--bail', '1'], spawned.run);
    } finally {
      process.chdir(cwd);
    }
    expect(spawned.calls).toHaveLength(1);
    expect(spawned.calls[0].args).not.toContain('--contract');
    expect(spawned.calls[0].args).toContain('--bail');
  });

  it('does nothing, and does not fail, in a pack with no vitest config', async () => {
    const spawned = recorder();
    await expect(contractTest(pack({}, { vitest: false }), [], spawned.run)).resolves.toBeUndefined();
    expect(spawned.calls).toEqual([]);
  });

  it('accepts any of the vitest config filenames', async () => {
    const spawned = recorder();
    await contractTest(pack({ 'vite.config.mts': 'export default {}\n' }), [], spawned.run);
    expect(spawned.calls).toHaveLength(1);
  });

  it('fails when vitest does', async () => {
    const dir = pack({ 'vitest.config.ts': 'export default {}\n' });
    await expect(contractTest(dir, [], recorder(1).run)).rejects.toThrow(/Contract tests failed \(vitest exited 1\)/);
  });

  it('says so when the runner did not exit normally', async () => {
    const dir = pack({ 'vitest.config.ts': 'export default {}\n' });
    await expect(contractTest(dir, [], recorder(null).run)).rejects.toThrow(/without a status/);
  });

  // The Playwright half throws without one; the contract half must not, since it starts no app
  it('needs no playwright.config.ts', async () => {
    const dir = pack({ 'vitest.config.ts': 'export default {}\n' });
    expect(fs.existsSync(path.join(dir, 'playwright.config.ts'))).toBe(false);
    await expect(contractTest(dir, [], recorder().run)).resolves.toBeUndefined();
  });

  it('is in the usage, with both halves', () => {
    expect(TEST_USAGE).toContain('--contract');
    expect(TEST_USAGE).toMatch(/starts no app/);
  });
});
