// `abuddy add step|artifact|block|migration` scaffold what the host uses: flow helpers generate valid names
// and types for a kebab-case step, and components declare the props and emits the host passes
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { init } from '../../src/commands/init';
import { addStep } from '../../src/commands/add/step';
import { addArtifact } from '../../src/commands/add/artifact';
import { addBlock } from '../../src/commands/add/block';
import { addMigration } from '../../src/commands/add/migration';
import { generateEntries } from '../../src/commands/generate-entries';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const BIN = path.join(REPO_ROOT, 'node_modules', '.bin');

let tmp: string;
let pack: string;

const read = (file: string) => fs.readFileSync(path.join(pack, file), 'utf-8');
const write = (file: string, content: string) => {
  fs.mkdirSync(path.dirname(path.join(pack, file)), { recursive: true });
  fs.writeFileSync(path.join(pack, file), content);
};
const readManifest = () => JSON.parse(read('abuddy.json'));
const writeManifest = (manifest: unknown) => write('abuddy.json', JSON.stringify(manifest, null, 2) + '\n');

function run(cmd: string, args: string[]): { code: number; output: string } {
  try {
    return { code: 0, output: execFileSync(cmd, args, { cwd: pack, stdio: ['ignore', 'pipe', 'pipe'] }).toString() };
  } catch (err: any) {
    return { code: err.status ?? 1, output: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-add-extensions-'));
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
}, 60_000);

afterAll(() => {
  vi.restoreAllMocks();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('abuddy add step', () => {
  it('names the DSL node interface DSL<Type>Node and the form takes node/resources, emitting update-node and close', async () => {
    await addStep(['my-step'], pack);
    const dir = 'src/extensions/steps/my-step';

    expect(read(`${dir}/types.ts`)).toMatch(/export interface DSLMyStepNode extends DSLNodeBase \{/);
    expect(read(`${dir}/types.ts`)).toMatch(/export interface MyStepNode extends NodeBase \{\s*nodeType: 'my-step';/);
    expect(read(`${dir}/build.ts`)).toContain('node as unknown as DSLMyStepNode');
    const form = read(`${dir}/form.vue`);
    expect(form).toMatch(/defineProps<\{[\s\S]*node: MyStepNode;/);
    expect(form).toMatch(/'update-node': \[updates: Record<string, unknown>\];/);
  }, 60_000);

  it('generates flow helpers for the kebab-case step that typecheck with tsc', async () => {
    await addStep(['my-other-step'], pack);
    const manifest = readManifest();
    const definition = (type: string) => manifest.steps.definitions.find((d: { type: string }) => d.type === type);
    definition('my-step').dsl = { primaryField: 'label' };
    definition('my-other-step').dsl = {};
    writeManifest(manifest);
    await generateEntries([], pack);

    const flowHelpers = read('src/__generated__/flow-helpers.ts');
    expect(flowHelpers).toContain('export function myStep(label: string, opts?: { [K in keyof DSLMyStepNode as');
    expect(flowHelpers).toContain('export function myOtherStep(label?: string): DSLStepNode {');
    // The step's compiled node joins the pack's Node rows
    expect(read('src/__generated__/types.ts')).toContain('export type NodeEntity = MyStepNode | MyOtherStepNode;');

    write('src/flow-helpers-usage.ts', [
      "import type { DSLStepNode } from '@abuddy/sdk/build';",
      "import { myStep, myOtherStep } from '#generated/flow-helpers';",
      "export const nodes: DSLStepNode[] = [myStep('Hello', { description: 'd' }), myOtherStep()];",
      '',
    ].join('\n'));
    const tsc = run(path.join(BIN, 'tsc'), ['--noEmit']);
    fs.rmSync(path.join(pack, 'src/flow-helpers-usage.ts'));
    expect(tsc.code, tsc.output).toBe(0);
  }, 180_000);
});

describe('abuddy add step in a pack without steps', () => {
  it('creates the step list the manifest names, so the pack builds', async () => {
    const bare = path.join(tmp, 'bare-pack');
    fs.mkdirSync(bare, { recursive: true });
    fs.writeFileSync(path.join(bare, 'abuddy.json'), JSON.stringify({ id: 'bare-pack', name: 'Bare', version: '1.0.0' }));
    fs.writeFileSync(path.join(bare, 'package.json'), JSON.stringify({ name: 'bare-pack', type: 'module' }));
    fs.symlinkSync(path.join(REPO_ROOT, 'node_modules'), path.join(bare, 'node_modules'), 'dir');

    await addStep(['ping'], bare);

    const manifest = JSON.parse(fs.readFileSync(path.join(bare, 'abuddy.json'), 'utf-8'));
    expect(manifest.steps.register).toBe('src/extensions/steps/register.ts');
    const register = fs.readFileSync(path.join(bare, manifest.steps.register), 'utf-8');
    expect(register).toContain("import { pingStep } from './ping';");
    expect(register).toMatch(/export const steps: StepDefinition\[\] = \[[\s\S]*pingStep,/);
  }, 60_000);
});

describe('abuddy add artifact and block', () => {
  beforeAll(() => {
    write('src/extensions/artifacts/register.ts', [
      "import type { ArtifactDefinition } from '@abuddy/sdk/artifacts';",
      '',
      'export const artifacts: ArtifactDefinition[] = [',
      '];',
      '',
    ].join('\n'));
    write('src/extensions/artifacts/register-fe.ts', [
      "import type { ArtifactDefinition } from '@abuddy/sdk/artifacts';",
      "import { artifacts } from './register';",
      '',
      'const componentMap: Record<string, unknown> = {',
      '};',
      '',
      'export const artifactsFE: ArtifactDefinition[] = artifacts.map(def => ({',
      '  ...def,',
      '  fe: def.fe ? { ...def.fe, component: componentMap[def.type] } : undefined,',
      '}));',
      '',
    ].join('\n'));
    write('src/extensions/blocks/register.ts', [
      "import type { BlockDefinition } from '@abuddy/sdk/blocks';",
      '',
      'export const blocks: BlockDefinition[] = [',
      '];',
      '',
    ].join('\n'));
    write('src/extensions/blocks/register-fe.ts', [
      "import type { BlockDefinition } from '@abuddy/sdk/blocks';",
      "import { blocks } from './register';",
      '',
      'const componentMap: Record<string, unknown> = {',
      '};',
      '',
      'export const blocksFE: BlockDefinition[] = blocks.map(def => ({',
      '  ...def,',
      '  fe: componentMap[def.type] ? { component: componentMap[def.type] } : undefined,',
      '}));',
      '',
    ].join('\n'));
    writeManifest({ ...readManifest(), artifacts: 'src/extensions/artifacts/register.ts', blocks: 'src/extensions/blocks/register.ts' });
  });

  it('scaffolds an artifact viewer taking artifact, registered by component', async () => {
    await addArtifact(['chart'], pack);
    await addArtifact(['table'], pack);

    const viewer = read('src/extensions/artifacts/viewers/chart-artifact.vue');
    expect(viewer).toContain("import type { ArtifactItem } from '@abuddy/sdk/artifacts';");
    expect(viewer).toContain('defineProps<{ artifact: ArtifactItem }>();');

    const register = read('src/extensions/artifacts/register.ts');
    expect(register).toContain("  { type: 'chart', fe: { icon: FileText } },\n  { type: 'table', fe: { icon: FileText } },\n];");
    expect(register.match(/import \{ FileText \} from 'lucide-vue-next';/g)).toHaveLength(1);
    expect(read('src/extensions/artifacts/register-fe.ts')).toContain("  'chart': ChartArtifact,\n  'table': TableArtifact,\n};");
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

    expect(read('src/extensions/blocks/register.ts')).toContain("  { type: 'rating' },\n  { type: 'color-picker', kind: 'input' },\n];");
    expect(read('src/extensions/blocks/register-fe.ts')).toContain("  'rating': RatingBlock,\n  'color-picker': ColorPickerInput,\n};");
  });

  it('scaffolds single-file components and register files that typecheck with vue-tsc', () => {
    write('tsconfig.sfc.json', JSON.stringify({ extends: './tsconfig.json', include: ['env.d.ts', 'src/**/*.ts', 'src/**/*.vue'] }));
    const vueTsc = run(path.join(BIN, 'vue-tsc'), ['--noEmit', '-p', 'tsconfig.sfc.json']);
    expect(vueTsc.code, vueTsc.output).toBe(0);
  }, 180_000);
});

describe('abuddy add migration', () => {
  it('scaffolds PackMigrations listed in the migrations index, which the pack entry registers and tsc accepts', async () => {
    await addMigration(['0.2.0'], pack);
    await addMigration(['--version', '0.10.1'], pack);
    await addMigration(['0.11.0-beta.1'], pack);

    const migration = read('src/migrations/0.2.0.ts');
    expect(migration).toContain("import type { PackMigration } from '@abuddy/sdk/framework';");
    expect(migration).toMatch(/export const migration: PackMigration = \{[\s\S]*target: '0\.2\.0'/);
    const index = read('src/migrations/index.ts');
    expect(index).toContain("import { migration as v0_2_0 } from './0.2.0';\nimport { migration as v0_10_1 } from './0.10.1';\nimport { migration as v0_11_0_beta_1 } from './0.11.0-beta.1';");
    expect(index).toContain('export const migrations: PackMigration[] = [\n  v0_2_0,\n  v0_10_1,\n  v0_11_0_beta_1,\n];');
    expect(readManifest().migrations).toBe('src/migrations/index.ts');

    await generateEntries([], pack);
    expect(read('src/__generated__/pack-entry.ts')).toMatch(/import \{ migrations \} from '\.\.\/migrations\/index\.js';[\s\S]*\n {2}migrations,/);
    const tsc = run(path.join(BIN, 'tsc'), ['--noEmit']);
    expect(tsc.code, tsc.output).toBe(0);
  }, 180_000);

  it('adds the import after an index whose only import is its first line', async () => {
    write('src/migrations/index.ts', "import type { PackMigration } from '@abuddy/sdk/framework';\n\nexport const migrations: PackMigration[] = [\n];\n");
    await addMigration(['0.12.0'], pack);

    expect(read('src/migrations/index.ts')).toBe([
      "import type { PackMigration } from '@abuddy/sdk/framework';",
      "import { migration as v0_12_0 } from './0.12.0';",
      '',
      'export const migrations: PackMigration[] = [',
      '  v0_12_0,',
      '];',
      '',
    ].join('\n'));
  });
});
