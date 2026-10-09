// abuddy build compiles with the step definitions it loads into a registry of its own: a registry the process
// has bound (an app's, a test's) sees none of them.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PACK_LAYOUT } from '@abuddy/host/packs';
import { startTestRuntime } from '@abuddy/sdk/testing';
import { stepRegistry } from '@abuddy/sdk/steps';
import { createPackRegistry } from '@abuddy/host/packs';
import { build } from '../../src/commands/build';

const bound = createPackRegistry();
const roots: string[] = [];

beforeAll(() => {
  process.env.ABUDDY_ENV ??= 'test';
  process.env.ABUDDY_USER_DATA_DIR ??= fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-build-registry-data-'));
  startTestRuntime({ packs: bound });
});
afterAll(() => { for (const dir of roots) fs.rmSync(dir, { recursive: true, force: true }); });

/**
 * The pack: two step definitions, and one flow whose single step is `stepInFlow`.
 *
 * **A directory of its own per case**, because the seed compiler loads a pack's TypeScript through tsx, which
 * caches by path: two packs at one path leave the second case compiling the first one's flow, and reporting it.
 */
function pack(stepInFlow: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-build-registry-'));
  roots.push(root);
  const write = (file: string, content: string) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), content);
  };
  write('package.json', JSON.stringify({ name: 'registry-pack', type: 'module' }));
  write('abuddy.json', JSON.stringify({
    id: 'registry-pack', name: 'Registry pack', version: '1.0.0', builtIn: true,
    steps: { register: 'src/steps.mjs', build: 'src/steps.mjs', definitions: [] },
    content: { sources: { flows: 'src/content/flows' } },
  }));
  write('src/steps.mjs', `export const steps = [
    { type: 'listener', kind: 'trigger', trigger: { trackField: 'event', compile: () => ({}), decompile: () => ({}) } },
    { type: 'note', kind: 'step', build: { compile: () => ({ entity: {}, relations: [] }), validate: () => [], getLabel: () => 'Note' } },
  ];\n`);
  write('src/content/flows/main.ts', `export default { Main: [{ event: 'flow.entry', exits: [[{ type: '${stepInFlow}' }]] }] };\n`);
  return root;
}

/**
 * What the build said it compiled.
 *
 * **Its report rather than its output, because a build that fails now publishes nothing.** The later phases
 * fail here for want of installed dependencies — the facade gate needs `@abuddy/sdk` resolvable from the pack
 * — and phase 4, the one this file is about, has already run by then. The compiled seed used to be read from
 * `dist` in place; a build assembles that tree aside and removes it when it fails, so what survives a failed
 * build is what it printed. `result.counts` is the count behind that line, so the line is the count.
 */
async function compiledSeeds(root: string): Promise<string> {
  const cwd = process.cwd();
  process.chdir(root);
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  try {
    await build(['--skip-generate', '--skip-fe']).catch(() => {});
    return log.mock.calls.flat().join('\n');
  } finally {
    process.chdir(cwd);
    vi.restoreAllMocks();
  }
}

describe('a build', () => {
  it('compiles flows against the steps it loaded, and leaves the bound registry untouched', async () => {
    const root = pack('note');
    expect(await compiledSeeds(root), 'the flow compiled, so the build loaded its steps into a registry of its own')
      .toMatch(/flows: 1/);
    expect(bound.steps(), 'and the registry this process bound saw none of them').toEqual([]);
    expect(stepRegistry.all()).toEqual([]);

    // The build failed after that, so it published none of it — which is why the claim above is read off the
    // report. `build-output-swap.spec.ts` is where that behaviour is the subject rather than the condition
    expect(fs.existsSync(path.join(root, 'dist', PACK_LAYOUT.contentDir, 'flows.content.json'))).toBe(false);
  });

  /**
   * **What stops the case above passing over a build that loaded nothing.** Two empty registries are equally
   * true of a build whose own registry was empty, so the discriminating claim is this one: name a step no
   * definition declares and the flow compiles to nothing, with no count reported for it.
   */
  it('compiles no flow whose step is one no definition declares', async () => {
    expect(await compiledSeeds(pack('no-such-step'))).not.toMatch(/flows: \d/);
  });
});
