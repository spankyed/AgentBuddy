// The entry modules codegen writes.
//
// The pack ref, the frontend and backend entries, the plugin names they export, and the registrations the
// backend entry builds.
//
// One of five files split from a 1,365-line original; `_support/pack.ts` holds the fixture and why.
//
// @slow: 16 cases, every one a temp pack and a full codegen pass — the file 2.3-3.6s
// Every case mkdtemps a pack and removes it (`setupPackFixture`) and runs `generatePackFiles` over a
// fresh manifest, so the cost is the work rather than the test, and it is per case rather than per file —
// which is why splitting the original by subject moved the three compiling cases into `compiles.spec.ts`
// and left the pure ones costing what they cost. `goal-one-job-pool.md` Phase 5 has the boundary.
//
// The range is the span across runs rather than noise: a pool spreads across workers, so these read
// faster when fewer projects run beside them — measured 2026-10-06, this file was at the low end in a
// two-project run and the high end in an eleven-project one. Which is why the count is the durable
// figure here and a per-case millisecond is not.
import { describe, expect, it } from 'vitest';
import { setupPackFixture, dependency, generate, system, write, writePluginState  } from './_support/pack.ts';

setupPackFixture();

describe('generated ref', () => {
  // A FeatureRef is accepted wherever a send takes one, so the names ref() takes are what keep a misspelling out
  it("takes this pack's features, its dependencies' and the host's, and nothing else", async () => {
    const files = await generate(
      { dependencies: { 'base-pack': '1.0.0' }, features: [{ id: 'memos', plugin: { label: 'Fixture', state: writePluginState('src/memos/plugin') } }, system('jobs')] },
      { 'base-pack': dependency({ features: [{ id: 'calendar', plugin: { label: 'Fixture', state: writePluginState('x') } }, { id: 'worker', system: { entry: 'y' } }] }) },
    );
    expect(files['src/__generated__/ref.ts']).toContain(
      "export type FeatureName = 'memos' | 'demo-pack/memos' | 'jobs' | 'demo-pack/jobs' | 'base-pack/calendar' | 'base-pack/worker' | 'host/application' | 'host/settings' | 'host/bus';",
    );
    expect(files['src/__generated__/ref.ts']).toContain('export const ref = (name: FeatureName): FeatureRef');
  });
});

describe('generated frontend names', () => {
  // A name nothing declares fails to compile: a plugin named by data opens through `openPlugin` instead
  it("lists this pack's plugins by feature id and its dependencies' by ref, with no open-ended member", async () => {
    const files = await generate(
      { features: [{ id: 'memos', plugin: { label: 'Fixture', state: writePluginState('src/memos/plugin') } }, system('jobs')] },
      { 'base-pack': dependency({ features: [{ id: 'calendar', plugin: { label: 'Fixture', state: writePluginState('src/calendar/plugin') } }, { id: 'worker', system: { entry: 'src/worker/system' } }] }) },
    );

    expect(files['src/__generated__/fe.ts']).toContain("export type PluginName = 'memos' | 'base-pack/calendar';");
  });
});

describe('generated frontend entry', () => {
  it('uses one declaration identity for the backend and frontend bindings', async () => {
    const files = await generate({ features: [] });
    const identity = (file: string) => files[file].match(/declarationRevision: '([a-f0-9]{64})'/)?.[1];
    const backend = identity('src/__generated__/pack-entry.ts');
    expect(backend).toMatch(/^[a-f0-9]{64}$/);
    expect(identity('src/__generated__/pack-entry-fe.ts')).toBe(backend);
    const changed = await generate({ name: 'Different declarations', features: [] });
    expect(changed['src/__generated__/pack-entry.ts']).not.toContain(`declarationRevision: '${backend}'`);
  });

  // Keyed by feature, as the backend entry is: each plugin with its feature's role
  it("keys each plugin by its feature, with the feature's role, assembling declared presentation and machine bindings", async () => {
    const files = await generate({ features: [
      { id: 'settings', designation: 'settings', plugin: { label: 'Fixture', state: writePluginState('src/settings/plugin') } },
      { id: 'memos', plugin: { label: 'Fixture', state: writePluginState('src/memos/plugin') } },
    ] });
    const fe = files['src/__generated__/pack-entry-fe.ts'];

    expect(fe).toContain("  features: {\n    'settings': { plugin: __plugin_settings, designation: 'settings' },\n    'memos': { plugin: __plugin_memos },\n  },");
    expect(fe).toContain('import __plugin_settings_0 from "../settings/plugin.ts";');
    expect(fe).toContain('label: "Fixture", state: __plugin_settings_0');
    expect(fe).not.toContain('_module');
  });

  it('names the pack the frontend registration belongs to', async () => {
    const files = await generate({ features: [{ id: 'memos', plugin: { label: 'Fixture', state: writePluginState('src/memos/plugin') } }] });

    expect(files['src/__generated__/pack-entry-fe.ts']).toContain("id: 'demo-pack',");
  });

  it('opens the plugin that claims the default, not the pack\'s first', async () => {
    const files = await generate({ features: [
      { id: 'settings', plugin: { label: 'Fixture', state: writePluginState('src/settings/plugin') } },
      { id: 'memos', plugin: { label: 'Fixture', state: writePluginState('src/memos/plugin'), default: true } },
    ] });

    const fe = files['src/__generated__/pack-entry-fe.ts'];
    expect(fe).toContain("'memos': { plugin: __plugin_memos, default: true },");
    expect(fe).toContain("'settings': { plugin: __plugin_settings },");
  });

  /**
   * There is no fallback to "the pack's first plugin": `features` is a map, so the first key is whatever
   * order JSON tooling left behind, and a default chosen that way would move without anyone editing it. A
   * pack claiming none has no default plugin, which the shell already handles.
   */
  it('name no default when no plugin claims it', async () => {
    const files = await generate({ features: [
      { id: 'settings', plugin: { label: 'Fixture', state: writePluginState('src/settings/plugin') } },
      { id: 'memos', plugin: { label: 'Fixture', state: writePluginState('src/memos/plugin') } },
    ] });

    expect(files['src/__generated__/pack-entry-fe.ts']).not.toContain('default: true');
  });

  // So a frontend send to that role resolves, as it does on the backend
  it('lists a designated feature with no plugin for its role, and leaves out an undesignated one', async () => {
    const files = await generate({ features: [
      { id: 'memos', plugin: { label: 'Fixture', state: writePluginState('src/memos/plugin') } },
      system('scheduler', {}),
      system('worker'),
    ].map((f) => (f.id === 'scheduler' ? { ...f, designation: 'clock' } : f)) });

    const fe = files['src/__generated__/pack-entry-fe.ts'];
    expect(fe).toContain("'scheduler': { designation: 'clock' },");
    expect(fe).not.toContain("'worker'");
    expect(fe).toContain("'memos': { plugin: __plugin_memos },");
  });

  // The manifest names the module and `tiptapPlugins` is the export name by convention, so the convention
  // is checked rather than assumed: it used to reach the author as a missing binding in a generated file.
  it('names the module and the export it expects when a tiptap module exports neither', async () => {
    write('src/tiptap/index.ts', 'export const plugins = [];\n');

    await expect(generate({ fe: { tiptapPlugins: 'src/tiptap/index.ts' } })).rejects.toThrow('fe.tiptapPlugins: src/tiptap/index.ts doesn\'t export "tiptapPlugins"');
    await expect(generate({ fe: { tiptapPlugins: 'src/tiptap/missing.ts' } })).rejects.toThrow('fe.tiptapPlugins: no module found at src/tiptap/missing.ts');
  });

  it('registers the tiptap plugins a pack declares', async () => {
    write('src/tiptap/ok.ts', 'export const tiptapPlugins = [];\n');

    const fe = (await generate({ fe: { tiptapPlugins: 'src/tiptap/ok.ts' } }))['src/__generated__/pack-entry-fe.ts'];

    expect(fe).toContain("import { tiptapPlugins } from '../tiptap/ok.ts';");
    expect(fe).toContain('  tiptapPlugins,');
  });
});

describe('generated backend entry', () => {
  it('records which features have a plugin, and takes the plugin\'s name and icon from its module', async () => {
    const files = await generate({ features: [
      { id: 'memos', plugin: { label: 'Fixture', state: writePluginState('src/memos/plugin') } },
      system('brain'),
    ] });
    const entry = files['src/__generated__/pack-entry.ts'];
    expect(entry).toContain("    'memos': {\n      plugin: { receives: [] },\n      services: [],\n    }");
    expect(entry).toContain("    'brain': {\n      system: packSystem(__system_brain),\n      services: [],\n    }");
  });

  // One record, keyed by feature: the app derives every ref, system and plugin from it
  it('registers each feature once, in manifest order, with the events the manifest adds', async () => {
    const entry = (await generate({ features: [
      system('logs'),
      { ...system('inbox'), system: { entry: 'src/features/inbox/be/system.ts', events: { incoming: ['MAIL_ARRIVED'] } } },
      { ...system('config'), designation: 'settings' },
    ] }))['src/__generated__/pack-entry.ts'];
    expect(entry).toContain("system: packSystem(__system_logs),");
    expect(entry).toContain(`system: packSystem(__system_inbox, { incoming: ["MAIL_ARRIVED"] }),`);
    // No role orders the features: a system that needs another's data reads it when it needs it
    expect(entry.indexOf("'logs': {")).toBeLessThan(entry.indexOf("'config': {"));
    expect(entry).not.toMatch(/systems:|earlySystem|early:|receivedEventTypes|toPackSystemDefs/);
  });

  it("carries the pack's declared slash commands, so registering it registers them", async () => {
    const withCommands = await generate({ commands: { note: { placeholder: 'Text' } }, features: [system('brain')] });
    expect(withCommands['src/__generated__/pack-entry.ts']).toContain('commands: [{"name":"note","placeholder":"Text"}],');

    // A pack that declares none says nothing
    expect((await generate({ features: [system('brain')] }))['src/__generated__/pack-entry.ts']).not.toContain('commands:');
  });

  it('fails for a command a dependency declares, which the app would refuse to register', async () => {
    const base = { 'base-pack': dependency({ commands: { instructions: { placeholder: 'Theirs' } } }) };
    await expect(generate({ commands: { instructions: { placeholder: 'Mine' } }, features: [system('brain')] }, base)).rejects.toThrow('Command "instructions" is declared by "base-pack", which this pack depends on');
    expect((await generate({ commands: { memo: { placeholder: 'Mine' } }, features: [system('brain')] }, base))['src/__generated__/pack-entry.ts'])
      .toContain('commands: [{"name":"memo","placeholder":"Mine"}],');
  });

  /**
   * `constructor` matches the command-name pattern, so it is a name a pack may declare. Looked up on an
   * ordinary object it finds `Object`'s constructor, and the build failed with
   * `declared by "function Object() { [native code] }"` — for a command nothing had declared.
   */
  it('accepts a command named after something on Object.prototype, which no pack declared', async () => {
    await expect(generate(
      { dependencies: { 'base-pack': '1.0.0' }, commands: { constructor: { placeholder: 'x' } } },
      { 'base-pack': dependency({ id: 'base-pack' }) },
    )).resolves.toBeDefined();
  });

  it('still fails when a dependency really does declare that name', async () => {
    await expect(generate(
      { dependencies: { 'base-pack': '1.0.0' }, commands: { constructor: { placeholder: 'x' } } },
      { 'base-pack': dependency({ id: 'base-pack', commands: { constructor: { placeholder: 'x' } } }) },
    )).rejects.toThrow('Command "constructor" is declared by "base-pack"');
  });

  it("fails for a command a dependency's own dependency declares, from the snapshot's provenance", async () => {
    const mid = { 'mid-pack': { ...dependency({ id: 'mid-pack' }), provenance: { commands: { pr2md: 'default-setup' } } } };
    await expect(generate({ commands: { pr2md: { placeholder: 'Mine' } }, features: [system('brain')] }, mid)).rejects.toThrow('Command "pr2md" is declared by "default-setup", which this pack depends on');
  });
});

describe('generated registrations', () => {
  // Everything a pack contributes arrives in its registration: no generated module registers anything when imported
  it('emits an empty omitted DSL prefix and quotes declared strings as data', async () => {
    const files = await generate({ dsl: {
      plain: { entry: 'src/plain.ts', targets: ['monaco'], globals: { 'quotedName': "typeof author['book']" } },
      scoped: { entry: 'src/scoped.ts', targets: ['monaco'], prefix: "author's:", globals: { item: 'Item' } },
    } });
    const code = files['src/__generated__/dsl-types-fe.ts'];
    expect(code).toContain('prefix: "",');
    expect(code).toContain(`prefix: ${JSON.stringify("author's:")},`);
    expect(code).toContain(`${JSON.stringify('quotedName')}: ${JSON.stringify("typeof author['book']")},`);
    expect(code).not.toContain("prefix: 'undefined'");
  });

  it("carry the pack's appliers and DSL types, which their modules only export", async () => {
    const files = await generate({
      features: [{ id: 'memos', plugin: { label: 'Fixture', state: writePluginState('src/features/memos/fe/plugin.ts') } }],
      content: { sources: { actions: 'src/content/actions' } },
      dsl: { memo: { entry: 'src/defs/memo.ts', targets: ['monaco'], prefix: 'memo:', globals: { memos: 'typeof _dsl.memos' } } },
    });
    expect(files['src/__generated__/pack-entry.ts']).toContain('\n  appliers,\n');
    expect(files['src/__generated__/appliers.ts']).toContain('export const appliers: ContentApplier[] = [');
    expect(files['src/__generated__/appliers.ts']).toContain('createFormatApplier({"key":"actions",');
    expect(files['src/__generated__/pack-entry-fe.ts']).toContain("import { dslTypes } from './dsl-types-fe.ts';");
    expect(files['src/__generated__/pack-entry-fe.ts']).toContain('\n  dslTypes,\n');
    expect(files['src/__generated__/dsl-types-fe.ts']).toContain([
      'export const dslTypes: Record<string, DslTypeConfig> = {',
      '  memo: {',
      '    prefix: "memo:",',
      '    schema: memoSchema,',
      '    globals: {',
      '      "memos": "typeof _dsl.memos",',
    ].join('\n'));
    for (const [file, content] of Object.entries(files)) {
      expect(content, file).not.toMatch(/^import '[^']+';$/m);
    }
  });

  it('carry no appliers or DSL types for a pack without them', async () => {
    const files = await generate({ features: [{ id: 'memos', plugin: { label: 'Fixture', state: writePluginState('src/features/memos/fe/plugin.ts') } }] });
    expect(files['src/__generated__/appliers.ts']).toContain('export const appliers: ContentApplier[] = [];');
    expect(files['src/__generated__/pack-entry-fe.ts']).not.toContain('dslTypes');
    expect(files).not.toHaveProperty(['src/__generated__/dsl-types-fe.ts']);
  });
});

describe('generated step registrations', () => {
  const stepPack = () => {
    write('src/steps/llm/build.ts', 'export const llmStepBuild = { compile: () => ({}), validate: () => [], getLabel: () => \'\' };\nexport const llmStepNode = { label: \'LLM\' };\n');
    write('src/steps/llm/fe.ts', 'export const llmStepFE = { nodeConfig: {} };\n');
    write('src/steps/llm/runtime.ts', 'export function handler() {}\n');
    write('src/steps/cron/build.ts', 'export const cronTrigger = { trackField: \'schedule\', compile: () => ({}), decompile: () => ({}) };\nexport const cronTriggerNode = { label: \'Cron\' };\n');
    write('src/steps/cron/fe.ts', 'export const cronTriggerFE = { nodeConfig: {} };\n');
    write('src/steps/cron/runtime.ts', 'export function register() {}\n');
    return {
      steps: {
        llm: {
          node: 'src/steps/llm/build.ts#llmStepNode',
          build: 'src/steps/llm/build.ts#llmStepBuild',
          fe: 'src/steps/llm/fe.ts#llmStepFE',
          runtime: { handler: 'src/steps/llm/runtime.ts#handler', isAsync: true },
        },
        cron: {
          kind: 'trigger',
          node: 'src/steps/cron/build.ts#cronTriggerNode',
          trigger: { facet: 'src/steps/cron/build.ts#cronTrigger', register: 'src/steps/cron/runtime.ts#register' },
          fe: 'src/steps/cron/fe.ts#cronTriggerFE',
        },
      },
    };
  };

  // Three places, three subsets: the backend runs a step, a dependent pack validates flows with it, and the
  // editor draws it. None of them is a barrel somebody keeps in step with the other two.
  it("send each facet where it is used: build and runtime to the backend, build alone to the module dependents load, fe to the frontend", async () => {
    const files = await generate(stepPack());

    const be = files['src/__generated__/pack-entry.ts'];
    expect(be).toContain("import { llmStepBuild as __step_llm_build } from '../steps/llm/build.ts';");
    expect(be).toContain("{ type: 'llm', node: __step_llm_node, build: __step_llm_build, runtime: { handler: async (tNode, node, ctx, actor) => (await import('../steps/llm/runtime.ts')).handler(tNode, node, ctx, actor), isAsync: true } },");
    expect(be).toContain("{ type: 'cron', kind: 'trigger', node: __step_cron_node, trigger: { ...__step_cron_trigger, register: async (node, ctx) => (await import('../steps/cron/runtime.ts')).register(node, ctx) } },");
    expect(be).not.toContain('llmStepFE');

    const build = files['src/__generated__/steps-build.ts'];
    expect(build).toContain("  { type: 'llm', build: __step_llm_build },\n  { type: 'cron', kind: 'trigger', trigger: __step_cron_trigger },");
    expect(build).not.toContain('runtime');
    expect(build).not.toContain('StepFE');
    // A dependent's build compiles and validates flows; it never creates a node, so it needs no node facet
    expect(build).not.toContain('Node');

    const fe = files['src/__generated__/pack-entry-fe.ts'];
    expect(fe).toContain("  steps: [\n    { type: 'llm', node: __step_llm_node, fe: __step_llm_fe },\n    { type: 'cron', kind: 'trigger', node: __step_cron_node, fe: __step_cron_fe },\n  ],");
    expect(fe).not.toContain('runtime');
    expect(fe).not.toContain('StepBuild');
  });

  // The facet both halves read. While it was part of `fe`, the backend registration carried none of it, so
  // every node the app created was missing its label and its field defaults and nothing reported it.
  it('send the node facet to both registrations', async () => {
    const files = await generate(stepPack());

    for (const entry of ['src/__generated__/pack-entry.ts', 'src/__generated__/pack-entry-fe.ts']) {
      expect(files[entry], entry).toContain("import { llmStepNode as __step_llm_node } from '../steps/llm/build.ts';");
      expect(files[entry], entry).toContain('node: __step_llm_node');
      expect(files[entry], entry).toContain('node: __step_cron_node');
    }
  });

  // The module is what a dependent pack's `apack pack build` loads, so the backend and it are generated from the
  // same entries rather than from two barrels that can name different facets
  it('name the same build facet in the backend entry and the module dependents load', async () => {
    const files = await generate(stepPack());
    for (const file of ['src/__generated__/pack-entry.ts', 'src/__generated__/steps-build.ts']) {
      expect(files[file], file).toContain("import { llmStepBuild as __step_llm_build } from '../steps/llm/build.ts';");
      expect(files[file], file).toContain("import { cronTrigger as __step_cron_trigger } from '../steps/cron/build.ts';");
    }
  });

  it('write no build module for a pack with no steps', async () => {
    const files = await generate({ features: [{ id: 'memos', plugin: { label: 'Fixture', state: writePluginState('src/features/memos/fe/plugin.ts') } }] });
    expect(files).not.toHaveProperty(['src/__generated__/steps-build.ts']);
    expect(files['src/__generated__/pack-entry.ts']).not.toContain('steps:');
  });

  it("carry a runtime of flags alone for a step whose behaviour is one", async () => {
    write('src/steps/sub/build.ts', 'export const subStepBuild = { compile: () => ({}), validate: () => [], getLabel: () => \'\' };\nexport const subStepNode = { label: \'Subflow\' };\n');
    const files = await generate({ steps: { subflow: { node: 'src/steps/sub/build.ts#subStepNode', build: 'src/steps/sub/build.ts#subStepBuild', runtime: { spawnsSubflow: true } } } });
    expect(files['src/__generated__/pack-entry.ts']).toContain("{ type: 'subflow', node: __step_subflow_node, build: __step_subflow_build, runtime: { spawnsSubflow: true } },");
  });

  /**
   * The trap this flag exists for: `kill` both ends the flow and completes itself, and those two sends have
   * to be ordered with the transition that called the handler. Behind a lazy import they land a tick later,
   * the flow stops first and the step's own COMPLETE reaches an actor that is gone — so the step reads as
   * still running. `default-setup/tests/extensions/steps/kill/step.spec.ts` is what fails when it regresses.
   */
  it('import a sync handler with the entry rather than on first run', async () => {
    write('src/steps/kill/build.ts', 'export const killStepBuild = { compile: () => ({}), validate: () => [], getLabel: () => \'\' };\nexport const killStepNode = { label: \'Kill\' };\n');
    write('src/steps/kill/runtime.ts', 'export function handler() {}\n');
    const files = await generate({ steps: { kill: { node: 'src/steps/kill/build.ts#killStepNode', build: 'src/steps/kill/build.ts#killStepBuild', runtime: { handler: 'src/steps/kill/runtime.ts#handler', sync: true } } } });
    const be = files['src/__generated__/pack-entry.ts'];

    expect(be).toContain("import { handler as __step_kill_handler } from '../steps/kill/runtime.ts';");
    expect(be).toContain("{ type: 'kill', node: __step_kill_node, build: __step_kill_build, runtime: { handler: __step_kill_handler } },");
    expect(be).not.toContain('await import');
  });

  it('fail naming the step and the export for a facet the module does not export', async () => {
    write('src/steps/llm/build.ts', 'export const other = {};\nexport const llmStepNode = { label: \'LLM\' };\n');
    await expect(generate({ steps: { llm: { node: 'src/steps/llm/build.ts#llmStepNode', build: 'src/steps/llm/build.ts#llmStepBuild' } } })).rejects.toThrow('Step "llm": build: src/steps/llm/build.ts doesn\'t export "llmStepBuild"');
  });

  /**
   * A step's `types.ts` and `helpers.ts` are read from the directory its facets sit in, and two of the three
   * readers are `existsSync`-filtered — so a directory guessed wrong drops the step's node types out of the
   * pack's shapes and says nothing. These are the two ways it could be guessed wrong.
   */
  it('refuse a step whose facets sit in different directories, naming the step and where they are', async () => {
    write('src/steps/split/build.ts', 'export const splitStepBuild = { compile: () => ({}), validate: () => [], getLabel: () => \'\' };\nexport const splitStepNode = { label: \'Split\' };\n');
    write('src/steps/elsewhere/fe.ts', 'export const splitStepFE = { nodeConfig: {} };\n');

    await expect(generate({
      steps: {
        split: {
          node: 'src/steps/split/build.ts#splitStepNode',
          build: 'src/steps/split/build.ts#splitStepBuild',
          fe: 'src/steps/elsewhere/fe.ts#splitStepFE',
        },
      },
    })).rejects.toThrow(/Step "split" spreads its facets across directories \(build in src\/steps\/split, fe in src\/steps\/elsewhere\)/);
  });

  // An assertion rather than a gate: the schema makes `node` required, so no validated manifest reaches
  // codegen with an entry naming nothing. Make `node` optional again and this is what fires.
  it('refuse a step entry that names no facet at all, rather than reading the pack root', async () => {
    await expect(generate({ steps: { ghost: {} } as never })).rejects.toThrow('Step "ghost" names no facet: declare at least "node", and whichever of "build"/"trigger"/"runtime"/"fe" it has');
  });
});

describe('generated artifact registrations', () => {
  // Both of an artifact's facets are frontend ones, so the backend entry carries the type alone — which is
  // what keeps the icon set out of a backend bundle
  it("name each artifact's icon and viewer in the frontend entry, and nothing but its type in the backend", async () => {
    write('src/artifacts/todo.vue', '<template><div /></template>\n');
    const files = await generate({
      features: [{ id: 'memos', plugin: { label: 'Fixture', state: writePluginState('src/features/memos/fe/plugin.ts') } }],
      artifacts: {
        todo: { icon: 'ListTodo', fe: 'src/artifacts/todo.vue' },
        graph: { icon: 'Network' },
      },
    });

    const be = files['src/__generated__/pack-entry.ts'];
    expect(be).toContain("  artifacts: [\n    { type: 'todo' },\n    { type: 'graph' },\n  ],");
    expect(be).not.toContain('lucide-vue-next');
    expect(be).not.toContain('todo.vue');

    const fe = files['src/__generated__/pack-entry-fe.ts'];
    expect(fe).toContain("import { ListTodo, Network } from 'lucide-vue-next';");
    expect(fe).toContain("import __artifactFE_0 from '../artifacts/todo.vue';");
    expect(fe).toContain("  artifacts: [\n    { type: 'todo', fe: { icon: ListTodo, component: __artifactFE_0 } },\n    { type: 'graph', fe: { icon: Network } },\n  ],");
  });

  // Two artifacts on one icon is ordinary — default-setup's `text` and `json` share FileText
  it('import each named icon once however many artifacts name it', async () => {
    const files = await generate({ artifacts: { text: { icon: 'FileText' }, json: { icon: 'FileText' } } });
    expect(files['src/__generated__/pack-entry-fe.ts'].match(/from 'lucide-vue-next'/g)).toHaveLength(1);
    expect(files['src/__generated__/pack-entry-fe.ts']).toContain("import { FileText } from 'lucide-vue-next';");
  });

  it('carry no artifacts for a pack that declares none', async () => {
    const files = await generate({ features: [{ id: 'memos', plugin: { label: 'Fixture', state: writePluginState('src/features/memos/fe/plugin.ts') } }] });
    expect(files['src/__generated__/pack-entry.ts']).not.toContain('artifacts:');
    expect(files['src/__generated__/pack-entry-fe.ts']).not.toContain('artifacts:');
  });

  it('fail naming the artifact and the file for a viewer path naming nothing', async () => {
    await expect(generate({ artifacts: { todo: { icon: 'ListTodo', fe: 'src/artifacts/missing.vue' } } })).rejects.toThrow('Artifact "todo": fe: no file at src/artifacts/missing.vue');
  });
});

describe('generated block registrations', () => {
  // The type is the manifest key and the kind is data, so neither half imports a barrel to learn them: the
  // backend entry carries the facet a backend process can run and the frontend entry the component
  it('split each declared block by facet: the backend facet into the backend entry, the component into the frontend', async () => {
    write('src/blocks/aside.ts', 'export const asideFacet = { generateAsideText: () => null };\n');
    write('src/blocks/Rating.vue', '<template><div /></template>\n');
    const files = await generate({
      features: [{ id: 'memos', plugin: { label: 'Fixture', state: writePluginState('src/features/memos/fe/plugin.ts') } }],
      blocks: {
        rating: { fe: 'src/blocks/Rating.vue' },
        approval: { kind: 'input', fe: 'src/blocks/Rating.vue', be: 'src/blocks/aside.ts#asideFacet' },
      },
    });

    const be = files['src/__generated__/pack-entry.ts'];
    expect(be).toContain("import { asideFacet as __blockBE_1 } from '../blocks/aside.ts';");
    expect(be).toContain("  blocks: [\n    { type: 'rating' },\n    { type: 'approval', kind: 'input', be: __blockBE_1 },\n  ],");
    expect(be).not.toContain('Rating.vue');

    const fe = files['src/__generated__/pack-entry-fe.ts'];
    expect(fe).toContain("import __blockFE_0 from '../blocks/Rating.vue';");
    expect(fe).toContain("  blocks: [\n    { type: 'rating', fe: { component: __blockFE_0 } },\n    { type: 'approval', kind: 'input', fe: { component: __blockFE_1 } },\n  ],");
    expect(fe).not.toContain('asideFacet');
  });

  it('carry no blocks for a pack that declares none', async () => {
    const files = await generate({ features: [{ id: 'memos', plugin: { label: 'Fixture', state: writePluginState('src/features/memos/fe/plugin.ts') } }] });
    expect(files['src/__generated__/pack-entry.ts']).not.toContain('blocks:');
    expect(files['src/__generated__/pack-entry-fe.ts']).not.toContain('blocks:');
  });

  it('fail naming the block and the file for a component path naming nothing', async () => {
    await expect(generate({ blocks: { rating: { fe: 'src/blocks/Missing.vue' } } })).rejects.toThrow('Block "rating": fe: no file at src/blocks/Missing.vue');
  });

  it("fail naming the block and the export for a backend facet the module doesn't export", async () => {
    write('src/blocks/aside.ts', 'export const asideFacet = {};\n');
    await expect(generate({ blocks: { rating: { be: 'src/blocks/aside.ts#missing' } } })).rejects.toThrow('Block "rating": be: src/blocks/aside.ts doesn\'t export "missing"');
  });
});


it('wires declared feature and group forms without inventing a plugin or importing them into the backend', async () => {
  const definition = { schema: { type: 'object' }, defaults: {} };
  write('src/feature.vue', '<template><div>Feature</div></template>');
  write('src/group.vue', '<template><div>Group</div></template>');
  const files = await generate({
    features: [{ id: 'shared', settings: { ...definition, form: 'src/feature.vue' } }],
    extensions: { settings: { shared: { ...definition, form: 'src/group.vue' } } },
  });
  const frontend = files['src/__generated__/pack-entry-fe.ts'];
  expect(frontend).toContain("import __settingsFeature_shared from '../feature.vue'");
  expect(frontend).toContain("import __settingsGroup_shared from '../group.vue'");
  expect(frontend).toContain("'shared': { settingsForm: __settingsFeature_shared }");
  expect(frontend).toContain("settingsForms: { 'shared': __settingsGroup_shared }");
  expect(frontend).not.toContain('plugin:');
  expect(files['src/__generated__/pack-entry.ts']).not.toMatch(/import .*feature.vue|import .*group.vue/);
});


it('generates routed and lazy panes, named state, custom icons and fallback predicates without evaluating them', async () => {
  write('src/state.ts', 'throw new Error("Do not activate"); export const machine = {} as import("xstate").AnyStateMachine;');
  write('src/predicate.ts', 'throw new Error("Do not activate"); export const visible = () => true;');
  for (const view of ['list', 'detail', 'icon', 'panel', 'chat']) write(`src/${view}.vue`, '<template><div /></template>');
  const files = await generate({ features: [{ id: 'notes', plugin: { label: 'Notes', state: 'src/state.ts#machine',
    icon: { entry: 'src/icon.vue' }, canvas: { routes: { entry: 'src/list.vue', view: { entry: 'src/detail.vue', load: 'lazy' } } },
    panel: 'src/panel.vue', chat: 'src/chat.vue',
    fallbackPanel: { label: 'Inspect', toggle: { type: 'INSPECT' }, isShown: 'src/predicate.ts#visible' } } }] });
  const frontend = files['src/__generated__/pack-entry-fe.ts'];
  expect(frontend).toContain('import { machine as __plugin_notes_0 }');
  expect(frontend).toContain('"entry": __plugin_notes_2');
  expect(frontend).toContain('defineAsyncComponent(() => import("../detail.vue").then(module => module.default))');
  expect(frontend).toContain('import { visible as __plugin_notes_5 }');
  expect(frontend).toContain('label: "Inspect", toggle: {"type":"INSPECT"}');
  expect(files['src/__generated__/pack-entry.ts']).not.toContain('src/state');
  write('src/predicate.ts', 'export type visible = boolean;');
  await expect(generate({ features: [{ id: 'notes', plugin: { label: 'Notes', state: 'src/state.ts#machine',
    fallbackPanel: { label: 'Inspect', toggle: { type: 'INSPECT' }, isShown: 'src/predicate.ts#visible' } } }] }))
    .rejects.toThrow('features.notes.plugin.fallbackPanel.isShown');
});
