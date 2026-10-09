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
import { setupPackFixture, dependency, generate, system, writePluginEntry  } from './_support/pack.ts';

setupPackFixture();

describe('generated ref', () => {
  // A FeatureRef is accepted wherever a send takes one, so the names ref() takes are what keep a misspelling out
  it("takes this pack's features, its dependencies' and the host's, and nothing else", () => {
    const files = generate(
      { dependencies: { 'base-pack': '1.0.0' }, features: [{ id: 'memos', plugin: { entry: writePluginEntry('src/memos/plugin') } }, system('jobs')] },
      { 'base-pack': dependency({ features: [{ id: 'calendar', plugin: { entry: writePluginEntry('x') } }, { id: 'worker', system: { entry: 'y' } }] }) },
    );
    expect(files['src/__generated__/ref.ts']).toContain(
      "export type FeatureName = 'memos' | 'jobs' | 'base-pack/calendar' | 'base-pack/worker' | 'host/application' | 'host/settings' | 'host/bus';",
    );
    expect(files['src/__generated__/ref.ts']).toContain('export const ref = (name: FeatureName): FeatureRef');
  });
});

describe('generated frontend names', () => {
  // A name nothing declares fails to compile: a plugin named by data opens through `openPlugin` instead
  it("lists this pack's plugins by feature id and its dependencies' by ref, with no open-ended member", () => {
    const files = generate(
      { features: [{ id: 'memos', plugin: { entry: writePluginEntry('src/memos/plugin') } }, system('jobs')] },
      { 'base-pack': dependency({ features: [{ id: 'calendar', plugin: { entry: writePluginEntry('src/calendar/plugin') } }, { id: 'worker', system: { entry: 'src/worker/system' } }] }) },
    );

    expect(files['src/__generated__/fe.ts']).toContain("export type PluginName = 'memos' | 'base-pack/calendar';");
  });
});

describe('generated frontend entry', () => {
  // Keyed by feature, as the backend entry is: each plugin with its feature's role
  it("keys each plugin by its feature, with the feature's role, passing the plugin module through untouched", () => {
    const files = generate({ features: [
      { id: 'settings', designation: 'settings', plugin: { entry: writePluginEntry('src/settings/plugin') } },
      { id: 'memos', plugin: { entry: writePluginEntry('src/memos/plugin') } },
    ] });
    const fe = files['src/__generated__/pack-entry-fe.ts'];

    expect(fe).toContain("  features: {\n    'settings': { plugin: __plugin_settings, designation: 'settings', default: true },\n    'memos': { plugin: __plugin_memos },\n  },");
    expect(fe).toContain("import __plugin_settings from '../settings/plugin.ts';");
    expect(fe).not.toContain('_module');
  });

  it('names the pack the frontend registration belongs to', () => {
    const files = generate({ features: [{ id: 'memos', plugin: { entry: writePluginEntry('src/memos/plugin') } }] });

    expect(files['src/__generated__/pack-entry-fe.ts']).toContain("id: 'demo-pack',");
  });

  it('opens the plugin that claims the default, not the pack\'s first', () => {
    const files = generate({ features: [
      { id: 'settings', plugin: { entry: writePluginEntry('src/settings/plugin') } },
      { id: 'memos', plugin: { entry: writePluginEntry('src/memos/plugin'), default: true } },
    ] });

    const fe = files['src/__generated__/pack-entry-fe.ts'];
    expect(fe).toContain("'memos': { plugin: __plugin_memos, default: true },");
    expect(fe).toContain("'settings': { plugin: __plugin_settings },");
  });

  it("falls back to the pack's first plugin when none claims it", () => {
    const files = generate({ features: [
      { id: 'settings', plugin: { entry: writePluginEntry('src/settings/plugin') } },
      { id: 'memos', plugin: { entry: writePluginEntry('src/memos/plugin') } },
    ] });

    expect(files['src/__generated__/pack-entry-fe.ts']).toContain("'settings': { plugin: __plugin_settings, default: true },");
  });

  // So a frontend send to that role resolves, as it does on the backend
  it('lists a designated feature with no plugin for its role, and leaves out an undesignated one', () => {
    const files = generate({ features: [
      { id: 'memos', plugin: { entry: writePluginEntry('src/memos/plugin') } },
      system('scheduler', {}),
      system('worker'),
    ].map((f) => (f.id === 'scheduler' ? { ...f, designation: 'clock' } : f)) });

    const fe = files['src/__generated__/pack-entry-fe.ts'];
    expect(fe).toContain("'scheduler': { designation: 'clock' },");
    expect(fe).not.toContain("'worker'");
    expect(fe).toContain("'memos': { plugin: __plugin_memos, default: true },");
  });
});

describe('generated backend entry', () => {
  it('records which features have a plugin, and takes the plugin\'s name and icon from its module', () => {
    const files = generate({ features: [
      { id: 'memos', plugin: { entry: writePluginEntry('src/memos/plugin') } },
      system('brain'),
    ] });
    const entry = files['src/__generated__/pack-entry.ts'];
    expect(entry).toContain("    'memos': {\n      plugin: { receives: [] },\n      services: [],\n    }");
    expect(entry).toContain("    'brain': {\n      system: packSystem(__system_brain),\n      services: [],\n    }");
  });

  // One record, keyed by feature: the app derives every ref, system and plugin from it
  it('registers each feature once, in manifest order, with the events the manifest adds', () => {
    const entry = generate({ features: [
      system('logs'),
      { ...system('inbox'), system: { entry: 'src/features/inbox/be/system.ts', events: { incoming: ['MAIL_ARRIVED'] } } },
      { ...system('config'), designation: 'settings' },
    ] })['src/__generated__/pack-entry.ts'];
    expect(entry).toContain("system: packSystem(__system_logs),");
    expect(entry).toContain(`system: packSystem(__system_inbox, { incoming: ["MAIL_ARRIVED"] }),`);
    // No role orders the features: a system that needs another's data reads it when it needs it
    expect(entry.indexOf("'logs': {")).toBeLessThan(entry.indexOf("'config': {"));
    expect(entry).not.toMatch(/systems:|earlySystem|early:|receivedEventTypes|toPackSystemDefs/);
  });

  it("carries the pack's declared slash commands, so registering it registers them", () => {
    const withCommands = generate({ commands: [{ name: 'note', placeholder: 'Text' }], features: [system('brain')] });
    expect(withCommands['src/__generated__/pack-entry.ts']).toContain('commands: [{"name":"note","placeholder":"Text"}],');

    // A pack that declares none says nothing
    expect(generate({ features: [system('brain')] })['src/__generated__/pack-entry.ts']).not.toContain('commands:');
  });

  it('fails for a command a dependency declares, which the app would refuse to register', () => {
    const base = { 'base-pack': dependency({ commands: [{ name: 'instructions', placeholder: 'Theirs' }] }) };
    expect(() => generate({ commands: [{ name: 'instructions', placeholder: 'Mine' }], features: [system('brain')] }, base))
      .toThrow('Command "instructions" is declared by "base-pack", which this pack depends on');
    expect(generate({ commands: [{ name: 'memo', placeholder: 'Mine' }], features: [system('brain')] }, base)['src/__generated__/pack-entry.ts'])
      .toContain('commands: [{"name":"memo","placeholder":"Mine"}],');
  });

  /**
   * `constructor` matches the command-name pattern, so it is a name a pack may declare. Looked up on an
   * ordinary object it finds `Object`'s constructor, and the build failed with
   * `declared by "function Object() { [native code] }"` — for a command nothing had declared.
   */
  it('accepts a command named after something on Object.prototype, which no pack declared', () => {
    expect(() => generate(
      { dependencies: { 'base-pack': '1.0.0' }, commands: [{ name: 'constructor' }] },
      { 'base-pack': dependency({ id: 'base-pack' }) },
    )).not.toThrow();
  });

  it('still fails when a dependency really does declare that name', () => {
    expect(() => generate(
      { dependencies: { 'base-pack': '1.0.0' }, commands: [{ name: 'constructor' }] },
      { 'base-pack': dependency({ id: 'base-pack', commands: [{ name: 'constructor' }] }) },
    )).toThrow('Command "constructor" is declared by "base-pack"');
  });

  it("fails for a command a dependency's own dependency declares, from the snapshot's provenance", () => {
    const mid = { 'mid-pack': { ...dependency({ id: 'mid-pack' }), provenance: { commands: { pr2md: 'default-setup' } } } };
    expect(() => generate({ commands: [{ name: 'pr2md', placeholder: 'Mine' }], features: [system('brain')] }, mid))
      .toThrow('Command "pr2md" is declared by "default-setup", which this pack depends on');
  });
});

describe('generated registrations', () => {
  // Everything a pack contributes arrives in its registration: no generated module registers anything when imported
  it("carry the pack's appliers and DSL types, which their modules only export", () => {
    const files = generate({
      features: [{ id: 'memos', plugin: { entry: writePluginEntry('src/features/memos/fe/plugin.ts') } }],
      boot: { seed: { actions: 'src/content/actions' } },
      dsl: { memo: { entry: 'src/defs/memo.ts', targets: ['monaco'], prefix: 'memo:', globals: { memos: 'typeof _dsl.memos' } } },
    });
    expect(files['src/__generated__/pack-entry.ts']).toContain('\n  appliers,\n');
    expect(files['src/__generated__/appliers.ts']).toContain('export const appliers: ContentApplier[] = [');
    expect(files['src/__generated__/pack-entry-fe.ts']).toContain("import { dslTypes } from './dsl-types-fe.ts';");
    expect(files['src/__generated__/pack-entry-fe.ts']).toContain('\n  dslTypes,\n');
    expect(files['src/__generated__/dsl-types-fe.ts']).toContain([
      'export const dslTypes: Record<string, DslTypeConfig> = {',
      '  memo: {',
      "    prefix: 'memo:',",
      '    schema: memoSchema,',
      '    globals: {',
      "      memos: 'typeof _dsl.memos',",
    ].join('\n'));
    for (const [file, content] of Object.entries(files)) {
      expect(content, file).not.toMatch(/^import '[^']+';$/m);
    }
  });

  it('carry no appliers or DSL types for a pack without them', () => {
    const files = generate({ features: [{ id: 'memos', plugin: { entry: writePluginEntry('src/features/memos/fe/plugin.ts') } }] });
    expect(files['src/__generated__/appliers.ts']).toContain('export const appliers: ContentApplier[] = [];');
    expect(files['src/__generated__/pack-entry-fe.ts']).not.toContain('dslTypes');
    expect(files).not.toHaveProperty(['src/__generated__/dsl-types-fe.ts']);
  });
});
