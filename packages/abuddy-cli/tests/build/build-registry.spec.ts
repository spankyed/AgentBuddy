// abuddy build compiles with the step definitions it loads into a registry of its own: a registry the process
// has bound (an app's, a test's) sees none of them.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { startTestRuntime } from '@abuddy/sdk/testing';
import { stepRegistry } from '@abuddy/sdk/steps';
import { createPackRegistry } from '@abuddy/host/packs';
import { build } from '../../src/commands/build';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-build-registry-'));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

const write = (file: string, content: string) => {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), content);
};

describe('a build', () => {
  it('validates flows against the steps it loaded, and leaves the bound registry untouched', async () => {
    const bound = createPackRegistry();
    process.env.ABUDDY_ENV ??= 'test';
    process.env.ABUDDY_USER_DATA_DIR ??= root;
    startTestRuntime({ packs: bound });

    write('package.json', JSON.stringify({ name: 'registry-pack', type: 'module' }));
    write('abuddy.json', JSON.stringify({
      id: 'registry-pack', name: 'Registry pack', version: '1.0.0', builtIn: true,
      steps: { register: 'src/steps.mjs', build: 'src/steps.mjs', definitions: [] },
      boot: { seed: { flows: 'src/seeds/flows' } },
    }));
    write('src/steps.mjs', `export const steps = [
      { type: 'listener', kind: 'trigger', trigger: { trackField: 'event', compile: () => ({}), decompile: () => ({}) } },
      { type: 'note', kind: 'step', build: { compile: () => ({ entity: {}, relations: [] }), validate: () => [], getLabel: () => 'Note' } },
    ];\n`);
    write('src/seeds/flows/main.ts', "export default { Main: [{ event: 'flow.entry', exits: [[{ type: 'note' }]] }] };\n");

    const cwd = process.cwd();
    process.chdir(root);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      // Later steps (the facade types, with no generated entries) may fail: the seeds compile first
      await build(['--skip-generate']).catch(() => {});
    } finally {
      process.chdir(cwd);
      vi.restoreAllMocks();
    }

    expect(Object.keys(JSON.parse(fs.readFileSync(path.join(root, 'dist', 'flows.seed.json'), 'utf-8')))).toEqual(['Main']);
    expect(bound.steps()).toEqual([]);
    expect(stepRegistry.all()).toEqual([]);
  });
});
