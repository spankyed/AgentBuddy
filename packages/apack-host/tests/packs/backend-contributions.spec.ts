import { expect, it } from 'vitest';
import { ManifestSchema } from '@apackdev/sdk/build';
import { backendBindingProblem } from '../../src/packs/declaration-binding.ts';

const manifest = ManifestSchema.parse({
  id: 'contributions', name: 'Contributions', version: '1.0.0',
  entities: { Item: 'Item' }, relKinds: { ItemLink: 'item_link' },
  extensions: {
    steps: { execute: { node: 'node.ts#node', build: 'build.ts#build', runtime: { handler: 'runtime.ts#handler', waits: true } } },
    blocks: { answer: { kind: 'input', be: 'block.ts#block' } },
    artifacts: { item: { icon: 'File' } },
    commands: { collect: { placeholder: 'Collect items' } },
  },
  content: { writers: { Item: 'writer.ts#writer' }, sources: { items: { applier: 'items.ts' } } },
  migrations: { app: { '1.0.0': 'migration.ts#migration' } },
  boot: { hooks: 'hooks.ts' },
});

function binding(): Record<string, unknown> {
  return {
    ears: { entities: { Item: 'Item' }, relKinds: { ItemLink: 'item_link' } },
    steps: [{ type: 'execute', node: {}, build: {}, runtime: { handler() {}, waits: true } }],
    blocks: [{ type: 'answer', kind: 'input', be: {} }], artifacts: [{ type: 'item' }],
    commands: [{ name: 'collect', placeholder: 'Collect items' }],
    contentWriters: { Item: {} }, appliers: [{ key: 'items', apply() {} }],
    migrations: { app: [{ target: '1.0.0', description: 'Initialize', up() {} }] },
    boot: { onInit() {} },
  };
}

it('accepts the declared backend contributions', () => {
  expect(backendBindingProblem(manifest, binding())).toBeUndefined();
});

it.each(['steps', 'blocks', 'artifacts', 'commands', 'appliers'])('refuses missing, extra and duplicate %s', field => {
  const key = field === 'commands' ? 'name' : field === 'appliers' ? 'key' : 'type';
  const original = binding()[field] as Record<string, unknown>[];
  for (const entries of [[], [...original, { [key]: 'ghost' }], [...original, original[0]], null]) {
    expect(backendBindingProblem(manifest, { ...binding(), [field]: entries }))
      .toBe(`Pack "contributions" runtime ${field} does not match its accepted declarations`);
  }
});

it.each([
  ['ears.entities', { ears: { entities: { Item: 'Other' }, relKinds: { ItemLink: 'item_link' } } }],
  ['ears.relKinds', { ears: { entities: { Item: 'Item' }, relKinds: {} } }],
  ['contentWriters', { contentWriters: { Other: {} } }],
  ['commands.collect.placeholder', { commands: [{ name: 'collect', placeholder: 'Different' }] }],
  ['artifacts.item.fe', { artifacts: [{ type: 'item', fe: {} }] }],
  ['blocks.answer.kind', { blocks: [{ type: 'answer', kind: 'display', be: {} }] }],
  ['blocks.answer.be', { blocks: [{ type: 'answer', kind: 'input' }] }],
  ['blocks.answer.be', { blocks: [{ type: 'answer', kind: 'input', be: null }] }],
  ['blocks.answer.fe', { blocks: [{ type: 'answer', kind: 'input', be: {}, fe: {} }] }],
  ['steps.execute.kind', { steps: [{ type: 'execute', kind: 'trigger' }] }],
  ['steps.execute.node', { steps: [{ type: 'execute', build: {} }] }],
  ['steps.execute.node', { steps: [{ type: 'execute', node: null, build: {} }] }],
  ['steps.execute.build', { steps: [{ type: 'execute', node: {} }] }],
  ['steps.execute.fe', { steps: [{ type: 'execute', fe: {} }] }],
  ['steps.execute.runtime', { steps: [{ type: 'execute', node: {}, build: {} }] }],
  ['steps.execute.runtime.handler', { steps: [{ type: 'execute', node: {}, build: {}, runtime: { waits: true } }] }],
  ['steps.execute.runtime.waits', { steps: [{ type: 'execute', node: {}, build: {}, runtime: { handler() {} } }] }],
  ['migrations.app', { migrations: { app: [] } }],
  ['migrations.app.1.0.0', { migrations: { app: [{ target: '1.0.0', description: 'Initialize' }] } }],
  ['migrations', { migrations: { unknown: [] } }],
  ['boot', { boot: undefined }],
  ['boot.onInit', { boot: { onInit: true } }],
] as const)('refuses mismatched %s', (path, change) => {
  expect(backendBindingProblem(manifest, { ...binding(), ...change }))
    .toBe(`Pack "contributions" runtime ${path} does not match its accepted declarations`);
});

it('does not admit a malformed handler when only runtime flags are declared', () => {
  const declaration = ManifestSchema.parse({ id: 'flags', name: 'Flags', version: '1.0.0',
    extensions: { steps: { wait: { node: 'node.ts#node', runtime: { waits: true } } } } });
  for (const handler of [null, 'handler', 0]) {
    expect(backendBindingProblem(declaration, {
      steps: [{ type: 'wait', node: {}, runtime: { waits: true, handler } }],
    })).toContain('steps.wait.runtime.handler');
  }
});
