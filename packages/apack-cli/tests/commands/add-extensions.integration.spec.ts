// `apack add step|artifact|block|migration` scaffold what the host uses: flow helpers generate valid names
// and types for a kebab-case step, and components declare the props and emits the host passes
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { packFixture } from '@apack/sdk/testing/pack-fixture';
import { init } from '../../src/commands/init';
import { addStep } from '../../src/commands/add/step';
import { addArtifact } from '../../src/commands/add/artifact';
import { addBlock } from '../../src/commands/add/block';
import { addMigration } from '../../src/commands/add/migration';
import { addAction } from '../../src/commands/add/action';
import { addPrompt } from '../../src/commands/add/prompt';
import { addFlow } from '../../src/commands/add/flow';
import { generateEntries } from '../../src/commands/generate-entries';
import { packRuleProblems } from '../../src/build/pack-rules.ts';
import { typecheckPack } from '../_support/pack-builds.ts';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const BIN = path.join(REPO_ROOT, 'node_modules', '.bin');

let tmp: string;
let pack: string;

const read = (file: string) => fs.readFileSync(path.join(pack, file), 'utf-8');
const write = (file: string, content: string) => {
  fs.mkdirSync(path.dirname(path.join(pack, file)), { recursive: true });
  fs.writeFileSync(path.join(pack, file), content);
};
const readManifest = () => JSON.parse(read('apack.json'));
const writeManifest = (manifest: unknown) => write('apack.json', JSON.stringify(manifest, null, 2) + '\n');

function run(cmd: string, args: string[]): { code: number; output: string } {
  try {
    return { code: 0, output: execFileSync(cmd, args, { cwd: pack, stdio: ['ignore', 'pipe', 'pipe'] }).toString() };
  } catch (err: any) {
    return { code: err.status ?? 1, output: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-add-extensions-'));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  const cwd = process.cwd();
  process.chdir(tmp);
  try {
    await init(['demo-pack']);
  } finally {
    process.chdir(cwd);
  }
  pack = path.join(tmp, 'demo-pack');
  fs.symlinkSync(path.join(REPO_ROOT, 'node_modules'), path.join(pack, 'node_modules'), 'dir');
});

afterAll(() => {
  vi.restoreAllMocks();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('apack add step', () => {
  it('names the DSL node interface DSL<Type>Node and the form takes node/resources, emitting update-node and close', async () => {
    await addStep(['my-step'], pack);
    const dir = 'src/extensions/steps/my-step';

    expect(read(`${dir}/types.ts`)).toMatch(/export interface DSLMyStepNode extends DSLNodeBase \{/);
    expect(read(`${dir}/types.ts`)).toMatch(/export interface MyStepNode extends NodeBase \{\s*nodeType: 'my-step';/);
    expect(read(`${dir}/build.ts`)).toContain('node as unknown as DSLMyStepNode');
    const form = read(`${dir}/form.vue`);
    expect(form).toMatch(/defineProps<\{[\s\S]*node: MyStepNode;/);
    expect(form).toMatch(/'update-node': \[updates: Record<string, unknown>\];/);
  });

  it('generates flow helpers for the kebab-case step that typecheck with tsc', async () => {
    await addStep(['my-other-step'], pack);
    const manifest = readManifest();
    manifest.extensions.steps['my-step'].dsl = { primaryField: 'label' };
    manifest.extensions.steps['my-other-step'].dsl = {};
    writeManifest(manifest);
    await generateEntries([], pack);

    const flowHelpers = read('src/__generated__/flow-helpers.ts');
    expect(flowHelpers).toContain('export function myStep(label: string, opts?: { [K in keyof DSLMyStepNode as');
    expect(flowHelpers).toContain('export function myOtherStep(label?: string): DSLStepNode {');
    // The step's compiled node joins the pack's Node rows
    expect(read('src/__generated__/types.ts')).toContain('export type NodeEntity = MyStepNode | MyOtherStepNode;');

    write('src/flow-helpers-usage.ts', [
      "import type { DSLStepNode } from '@apack/sdk/build';",
      "import { myStep, myOtherStep } from '#generated/flow-helpers';",
      "export const nodes: DSLStepNode[] = [myStep('Hello', { description: 'd' }), myOtherStep()];",
      '',
    ].join('\n'));
    const tsc = await typecheckPack(pack);
    fs.rmSync(path.join(pack, 'src/flow-helpers-usage.ts'));
    expect(tsc.code, tsc.output).toBe(0);
  });
});

describe('apack add step in a pack without steps', () => {
  it('declares the first step, in a manifest that names none', async () => {
    const bare = path.join(tmp, 'bare-pack');
    // A manifest with no features is the subject here, so it is written verbatim rather than varied
    packFixture({ at: bare, rawManifest: { id: 'bare-pack', name: 'Bare', version: '1.0.0' } });
    fs.writeFileSync(path.join(bare, 'package.json'), JSON.stringify({ name: 'bare-pack', type: 'module' }));
    fs.symlinkSync(path.join(REPO_ROOT, 'node_modules'), path.join(bare, 'node_modules'), 'dir');

    await addStep(['ping'], bare);

    const manifest = JSON.parse(fs.readFileSync(path.join(bare, 'apack.json'), 'utf-8'));
    expect(manifest.extensions.steps).toEqual({
      ping: {
        kind: 'step',
        node: 'src/extensions/steps/ping/build.ts#pingStepNode',
        build: 'src/extensions/steps/ping/build.ts#pingStepBuild',
        fe: 'src/extensions/steps/ping/fe.ts#pingStepFE',
      },
    });
    expect(fs.existsSync(path.join(bare, 'src/extensions/steps/ping/build.ts'))).toBe(true);
  });

  // A trigger is not a step with a flag: its facet is a TriggerFacet, from its own template. While both
  // kinds pointed at the step template's StepBuildFacet, `--trigger` scaffolded a pack that did not compile
  // and no test here asked it to.
  it('declares a trigger against its own facet, and the pack typechecks', async () => {
    // Its own scaffolded pack rather than the shared one: `init` is what writes the tsconfig `typecheckPack`
    // needs, and a trigger added to the shared pack would join the `NodeEntity` union another case pins
    const cwd = process.cwd();
    process.chdir(tmp);
    try {
      await init(['trigger-pack']);
    } finally {
      process.chdir(cwd);
    }
    const triggerPack = path.join(tmp, 'trigger-pack');
    fs.symlinkSync(path.join(REPO_ROOT, 'node_modules'), path.join(triggerPack, 'node_modules'), 'dir');

    await addStep(['heartbeat', '--trigger'], triggerPack);

    const manifest = JSON.parse(fs.readFileSync(path.join(triggerPack, 'apack.json'), 'utf-8'));
    expect(manifest.extensions.steps.heartbeat).toEqual({
      kind: 'trigger',
      node: 'src/extensions/steps/heartbeat/trigger.ts#heartbeatTriggerNode',
      trigger: { facet: 'src/extensions/steps/heartbeat/trigger.ts#heartbeatTriggerBuild' },
      fe: 'src/extensions/steps/heartbeat/fe.ts#heartbeatTriggerFE',
    });
    // Its own template, so no StepBuildFacet is written for it
    expect(fs.existsSync(path.join(triggerPack, 'src/extensions/steps/heartbeat/trigger.ts'))).toBe(true);
    expect(fs.existsSync(path.join(triggerPack, 'src/extensions/steps/heartbeat/build.ts'))).toBe(false);

    const tsc = await typecheckPack(triggerPack);
    expect(tsc.code, tsc.output).toBe(0);
  });

  it('refuses a step type the manifest already declares, leaving the manifest as it was', async () => {
    const bare = path.join(tmp, 'bare-pack');
    const before = fs.readFileSync(path.join(bare, 'apack.json'), 'utf-8');
    await expect(addStep(['ping'], bare)).rejects.toThrow('Step "ping" already exists in manifest');
    expect(fs.readFileSync(path.join(bare, 'apack.json'), 'utf-8')).toBe(before);
  });
});

describe('apack add artifact and block', () => {
  it('scaffolds an artifact viewer taking artifact, declared with its icon and viewer', async () => {
    await addArtifact(['chart'], pack);
    await addArtifact(['table', '--icon', 'Table2'], pack);

    const viewer = read('src/extensions/artifacts/viewers/chart-artifact.vue');
    expect(viewer).toContain("import type { ArtifactItem } from '@apack/sdk/artifacts';");
    expect(viewer).toContain('defineProps<{ artifact: ArtifactItem }>();');

    expect(readManifest().extensions.artifacts).toEqual({
      chart: { icon: 'FileText', fe: 'src/extensions/artifacts/viewers/chart-artifact.vue' },
      table: { icon: 'Table2', fe: 'src/extensions/artifacts/viewers/table-artifact.vue' },
    });
  });

  it('refuses an artifact type the manifest already declares, leaving the manifest as it was', async () => {
    const before = readManifest();
    await expect(addArtifact(['chart'], pack)).rejects.toThrow('Artifact "chart" already exists in manifest');
    expect(readManifest()).toEqual(before);
  });

  it('scaffolds display blocks taking their props and input blocks taking disabled/response, emitting submit/cancel', async () => {
    await addBlock(['rating'], pack);
    await addBlock(['color-picker', '--input'], pack);

    const display = read('src/extensions/blocks/display/RatingBlock.vue');
    expect(display).toContain('defineProps<{ text?: string }>();');
    expect(display).not.toMatch(/defineEmits/);

    const input = read('src/extensions/blocks/input/ColorPickerInput.vue');
    expect(input).toMatch(/defineProps<\{[\s\S]*label\?: string;/);
    expect(input).toMatch(/defineEmits<\{[\s\S]*submit: \[response: unknown\];/);

    expect(readManifest().extensions.blocks).toEqual({
      'rating': { fe: 'src/extensions/blocks/display/RatingBlock.vue' },
      'color-picker': { kind: 'input', fe: 'src/extensions/blocks/input/ColorPickerInput.vue' },
    });
  });

  it('refuses a block type the manifest already declares, leaving the manifest as it was', async () => {
    const before = readManifest();
    await expect(addBlock(['rating'], pack)).rejects.toThrow('Block "rating" already exists in manifest');
    expect(readManifest()).toEqual(before);
  });

  it('scaffolds single-file components and register files that typecheck with vue-tsc', () => {
    write('tsconfig.sfc.json', JSON.stringify({ extends: './tsconfig.json', include: ['env.d.ts', 'src/**/*.ts', 'src/**/*.vue'] }));
    const vueTsc = run(path.join(BIN, 'vue-tsc'), ['--noEmit', '-p', 'tsconfig.sfc.json']);
    expect(vueTsc.code, vueTsc.output).toBe(0);
  });
});

describe('apack add migration', () => {
  it('declares each migration under its version line and the version it targets, which the pack entry registers and tsc accepts', async () => {
    await addMigration(['0.2.0'], pack);
    await addMigration(['--version', '0.10.1'], pack);
    // A migration targets a release on either line, so a prerelease files under the release it belongs to
    await addMigration(['0.11.0-beta.1'], pack);
    await addMigration(['0.3.16-beta.1', '--app'], pack);

    const migration = read('src/migrations/0.2.0.ts');
    expect(migration).toContain("import type { DeclaredMigration } from '@apack/sdk/framework';");
    // The version is the manifest key and the line is the map, so the module restates neither
    expect(migration).not.toContain('target:');
    expect(readManifest().migrations).toEqual({
      pack: {
        '0.2.0': 'src/migrations/0.2.0.ts#migration',
        '0.10.1': 'src/migrations/0.10.1.ts#migration',
        '0.11.0': 'src/migrations/0.11.0.ts#migration',
      },
      app: { '0.3.16': 'src/migrations/0.3.16.ts#migration' },
    });
    expect(fs.existsSync(path.join(pack, 'src/migrations/index.ts'))).toBe(false);

    await generateEntries([], pack);
    const entry = read('src/__generated__/pack-entry.ts');
    // One array per line, each in version order, each entry with the target its key names
    expect(entry).toContain("    app: [\n      { target: '0.3.16', ...__migration_app_0_3_16 },\n    ],");
    expect(entry).toContain("    pack: [\n      { target: '0.2.0', ...__migration_pack_0_2_0 },\n      { target: '0.10.1', ...__migration_pack_0_10_1 },\n      { target: '0.11.0', ...__migration_pack_0_11_0 },\n    ],");
    const tsc = await typecheckPack(pack);
    expect(tsc.code, tsc.output).toBe(0);
  });

  it('refuses a version it already declares on that line, leaving the manifest as it was', async () => {
    const before = read('apack.json');
    await expect(addMigration(['0.2.0'], pack)).rejects.toThrow('Migration "0.2.0" already exists in manifest under "pack"');
    expect(read('apack.json')).toBe(before);

    // The same version on the *other* line is a different migration, so it is not a collision — and it
    // lands on a file that is already there, which is the one thing the two lines share. So codegen
    // imports that module twice under two locals, which is the case the typecheck below is here for
    await addMigration(['0.2.0', '--app'], pack);
    expect(readManifest().migrations?.app?.['0.2.0']).toBe('src/migrations/0.2.0.ts#migration');

    await generateEntries([], pack);
    const entry = read('src/__generated__/pack-entry.ts');
    expect(entry).toContain("import { migration as __migration_app_0_2_0 } from '../migrations/0.2.0.ts';");
    expect(entry).toContain("import { migration as __migration_pack_0_2_0 } from '../migrations/0.2.0.ts';");
    const tsc = await typecheckPack(pack);
    expect(tsc.code, tsc.output).toBe(0);
  });

  it('refuses a version that is not one a migration can target, before writing anything', async () => {
    const before = read('apack.json');
    await expect(addMigration(['banana'], pack)).rejects.toThrow('"banana" is not a version a migration can target');
    expect(read('apack.json'), 'nothing was written').toBe(before);
    expect(fs.existsSync(path.join(pack, 'src/migrations/banana.ts'))).toBe(false);

    // The manifest's schema holds the same rule and is the backstop, but it only speaks on the next read —
    // by which time the entry and an empty module are on disk and the command has said it worked
    await expect(addMigration(['1.0'], pack)).rejects.toThrow('is not a version a migration can target');
    expect(read('apack.json')).toBe(before);
  });

  it('takes the version from the first argument that is not a flag, so --app alone is not the version', async () => {
    // `--app` as args[0] was read as the version, and the prerelease normalisation strips from the first
    // `-`: the manifest gained a key of "" naming a file called `.ts`, and the command reported success
    await addMigration(['--app'], pack);

    const version = readManifest().version;
    expect(readManifest().migrations?.app?.[version]).toBe(`src/migrations/${version}.ts#migration`);
    expect(fs.existsSync(path.join(pack, 'src/migrations/.ts')), 'no file named for the empty version').toBe(false);
  });
});

/**
 * Everything `apack add` wrote, held to the rule `apack build` applies: a pack's specifier names the file
 * that is there. This is where the scaffold's own templates are checked against real files — the repo's
 * `check:specifiers` reads them as text, where a `'./${name}'` tells it nothing about the extension the
 * substitution carries.
 */
describe('what apack add scaffolds', () => {
  it('names its own modules by the file that is there', () => {
    expect([...packRuleProblems(pack, ['src', 'tests'])]).toEqual([]);
  });
});

/**
 * The apply scaffolds, which had no test reading their output before their templates became files
 * (`docs/goals/goal-one-rule-set.md`): `apack add action`, `add prompt` and `add flow` were covered only by
 * whether they exited 0.
 */
describe('apack add action, prompt and flow', () => {
  it('writes an action under its category, with the label and the typed services import', async () => {
    await addAction(['analyze-text'], pack);
    const action = read('src/content/actions/demo-pack/analyze-text.ts');
    expect(action).toContain("import type { Services, Z } from '#generated/services.ts';");
    expect(action).toContain("label: 'Analyze Text'");
    expect(action).toContain("category: 'demo-pack'");
    expect(action).toContain('export async function action(\n  params: Record<string, any>,\n  services: Services,');
  });

  it('writes a prompt with its label and template function', async () => {
    await addPrompt(['summarize-text'], pack);
    const prompt = read('src/content/prompts/summarize-text.ts');
    expect(prompt).toContain("import type { PromptMeta } from '@apack/sdk/build';");
    expect(prompt).toContain("label: 'Summarize Text'");
    expect(prompt).toContain('export function template(params: Record<string, any>)');
  });

  /**
   * `add flow` refuses a pack whose dependencies provide no steps, and it decides that by reading the pack's
   * generated flow helpers for `keepAlive` — so the fixture is that file, which is what a dependency's
   * generate-entries would have written.
   */
  it('writes a flow whose track uses the helpers the pack generates', async () => {
    write('src/__generated__/flow-helpers.ts', ['export const entry = 1;', 'export const keepAlive = 2;', ''].join('\n'));
    await addFlow(['onboarding'], pack);
    expect(read('src/content/flows/onboarding.ts')).toBe([
      "import type { FlowDSL } from '@apack/sdk/build';",
      "import { entry, keepAlive } from '#generated/flow-helpers.ts';",
      '',
      'export default {',
      '  "Onboarding": [',
      '    entry([keepAlive()]),',
      '  ],',
      '} satisfies FlowDSL;',
      '',
    ].join('\n'));
  });
});

