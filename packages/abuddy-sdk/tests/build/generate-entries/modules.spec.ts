// The generated modules' own surface.
//
// What the generated modules import and re-export: a diamond dependency resolved once, the EARS facade,
// the SDK re-exports, seeders, flow helpers, the type barrel, and the snapshot format that carries them.
//
// One of five files split from a 1,365-line original; `_support/pack.ts` holds the fixture and why.
//
// @slow: 26 cases, every one a temp pack and a full codegen pass — the file 3.5-5.5s
// Every case mkdtemps a pack and removes it (`setupPackFixture`) and runs `generatePackFiles` over a
// fresh manifest, so the cost is the work rather than the test, and it is per case rather than per file —
// which is why splitting the original by subject moved the three compiling cases into `compiles.spec.ts`
// and left the pure ones costing what they cost. `goal-one-job-pool.md` Phase 5 has the boundary.
//
// The range is the span across runs rather than noise: a pool spreads across workers, so these read
// faster when fewer projects run beside them — measured 2026-10-06, this file was at the low end in a
// two-project run and the high end in an eleven-project one. Which is why the count is the durable
// figure here and a per-case millisecond is not.
import { transformSync } from 'esbuild';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { PROVENANCE_KINDS, _buildProvenance } from '../../../src/build/manifest.ts';
import { SDK_ENTITIES, SDK_REL_KINDS } from '../../../src/types/sdk-entities.ts';
import type { PackFeatureEntry, PackManifest, PackPluginEntry, PackSnapshot, PackSystemEntry, SeedFormatConfig } from '../../../src/build/manifest.ts';
import type { PackFeature, PackFeaturePlugin, PackFeatureSystem, PackRegistration } from '../../../src/framework/index.ts';
import { setupPackFixture, PACK_SNAPSHOT_FORMAT, dependency, facade, generate, generatePackFiles, manifest, root, system, withPlugin, write, writePluginEntry, writeSystemEntry  } from './_support/pack.ts';

setupPackFixture();

// A → B and A → C, both of which depend on D. Nothing exercised two dependencies converging, which
// is where a collision is silent rather than obvious: each dependency is fine on its own.
describe('a diamond dependency', () => {
  const surfacing = (id: string, owner: string) => ({
    types: { entities: { Memo: 'Memo' }, relKinds: {} },
    defs: facade(),
    provenance: { entities: { Memo: owner } },
    manifest: manifest({ id }),
    format: PACK_SNAPSHOT_FORMAT,
  }) as PackSnapshot;

  // Both sides surface deep-pack's Memo, because a snapshot carries its dependencies' names so a
  // chain resolves one level deep. Attributing it to the dependency it arrived through made this
  // read as two packs declaring Memo — and since every pack depends on the base pack, that was every
  // pack with two dependencies.
  it('accepts one ancestor\'s entity arriving through both sides', () => {
    expect(() => generate({ features: [system('brain')] }, {
      'left-pack': surfacing('left-pack', 'deep-pack'),
      'right-pack': surfacing('right-pack', 'deep-pack'),
    })).not.toThrow();
  });

  /**
   * The same diamond, on an entity name assignment to an ordinary object would have lost. Each side's
   * provenance is produced by `_buildProvenance` and put through JSON, as a real build's is, because
   * that round trip is where the two halves of the hazard differ: `JSON.parse` defines `__proto__` as an
   * own property, while the assignment that wrote it did not.
   */
  /**
   * The read half, which the write half does not cover. A dependency can surface a name its provenance
   * does not record — its own dependency was built without provenance, say — and the lookup is then meant
   * to fall back to the pack the name arrived through. On an ordinary object a name like `constructor`
   * finds `Object`'s constructor instead, and that function becomes the declaring pack: it is compared
   * against other packs' names, and printed if a collision is reported.
   */
  it('falls back to the dependency for a surfaced name its provenance omits, even one Object.prototype has', async () => {
    const { mergeRegistries } = await import('../../../src/build/generate-entries.ts');
    const depTypes = new Map([['base-pack', { entities: { constructor: 'constructor' }, relKinds: {} }]]);
    const provenanceOmittingIt = new Map([['base-pack', { entities: JSON.parse('{"Memo":"deep-pack"}') }]]);

    const registry = mergeRegistries('app-pack', manifest({ id: 'app-pack' }), depTypes, provenanceOmittingIt);

    expect(registry.entities.get('constructor')?.source).toBe('base-pack');
  });

  it("accepts an ancestor's entity named __proto__ arriving through both sides", () => {
    const side = (id: string) => ({
      types: { entities: { ['__proto__']: '__proto__' }, relKinds: {} },
      defs: facade(),
        provenance: JSON.parse(JSON.stringify(_buildProvenance(
        [['deep-pack', { manifest: { entities: { ['__proto__']: '__proto__' } } }] as const],
        { id, manifest: {} },
      ))),
      manifest: manifest({ id }),
      format: PACK_SNAPSHOT_FORMAT,
    }) as PackSnapshot;

    expect(() => generate({ features: [system('brain')] }, {
      'left-pack': side('left-pack'),
      'right-pack': side('right-pack'),
    })).not.toThrow();
  });

  it('still reports two different packs that each declare the same entity', () => {
    expect(() => generate({ features: [system('brain')] }, {
      'left-pack': surfacing('left-pack', 'left-pack'),
      'right-pack': surfacing('right-pack', 'right-pack'),
    })).toThrow(/entity "Memo" declared by both/);
  });

});

describe('generated imports', () => {
  // The extension the module has, not the `.js` this used to write for a `.ts` file: a pack is bundled rather
  // than emitted as individual modules, and every tool in its toolchain resolves `.ts`. Explicit either way,
  // because no runtime resolves an extensionless specifier in ESM — which the second assertion pins.
  it('names generated modules by the file that is there', () => {
    const files = generate({ features: [system('memos')] });
    expect(files['src/__generated__/pack-entry.ts']).toContain("import { getCompiledDir, seeders } from './seeders.ts';");
    expect(files['src/__generated__/pack-entry.ts']).not.toMatch(/from '\.\/seeders';/);
  });

  it('keeps dots in extensionless names and normalizes backslashes', () => {
    write('src/features/memos/be/memo.types.ts', 'export interface MemoEntity { text: string }\n');
    const ears = generate({ entityShapes: { Memo: { source: 'src\\features\\memos\\be\\memo.types', type: 'MemoEntity' } } })['src/__generated__/ears.ts'];
    expect(ears).toContain("from '../features/memos/be/memo.types.ts';");
  });
});

describe('generated EARS facade', () => {
  it('names the declared entities and passes them to the typed helpers, with tx', () => {
    write('src/memo.ts', 'export interface MemoEntity { text: string }\n');
    const ears = generate({ entities: { Memo: 'Memo', Tag: 'Tag' }, entityShapes: { Memo: { source: 'src/memo.ts', type: 'MemoEntity' } } })['src/__generated__/ears.ts'];
    expect(ears).toContain(`export type EntityName = ${['Memo', 'Tag', ...Object.values(SDK_ENTITIES)].map((name) => `'${name}'`).join(' | ')};`);
    expect(ears).toContain('defineEars<PackShapes, EntityName>()');
    expect(ears).toMatch(/export const \{\n  qx, tx, findById/);
  });
});

describe("the SDK's entities and relation kinds", () => {
  it('are in every pack, with no entities or dependencies declared', () => {
    const ears = generate({})['src/__generated__/ears.ts'];
    for (const entity of Object.values(SDK_ENTITIES)) expect(ears).toContain(`export const ${entity} = '${entity}';`);
    for (const [name, kind] of Object.entries(SDK_REL_KINDS)) expect(ears).toContain(`export const ${name} = '${kind}';`);
    expect(ears).toContain(`export type EntityName = ${Object.values(SDK_ENTITIES).map((name) => `'${name}'`).join(' | ')};`);
    expect(ears).toContain("import type { SdkEntityShapes } from '@abuddy/sdk';");
    // Relation alone doesn't close the pack's Entity type
    expect(ears).toContain('export type Entity = string;');
  });

  it("rejects a dependency whose types still declare the SDK's names, asking to rebuild it", () => {
    const base = { ...dependency({}), types: { entities: { Flow: 'Flow', Tag: 'Tag' }, relKinds: { NEXT: 'transitions_to' } } };
    expect(() => generate({ dependencies: { 'base-pack': '*' } }, { 'base-pack': base })).toThrow(
      'Type conflicts:\n  entity "Flow" from "base-pack" is defined by the SDK: rebuild "base-pack" with the current abuddy CLI',
    );
    const relKindsOnly = { ...dependency({}), types: { entities: { Tag: 'Tag' }, relKinds: { NEXT: 'transitions_to' } } };
    expect(() => generate({ dependencies: { 'base-pack': '*' } }, { 'base-pack': relKindsOnly }))
      .toThrow('relKind "NEXT": "transitions_to" from "base-pack" is defined by the SDK');
  });

  it('rejects a name or value two sources declare', () => {
    const base = { ...dependency({}), types: { entities: { Tag: 'Tag' }, relKinds: { TAGGED: 'tagged' } } };
    const withBase = (manifest: object) => () => generate({ ...manifest, dependencies: { 'base-pack': '*' } }, { 'base-pack': base });
    expect(withBase({ entities: { Tag: 'Tag' } })).toThrow('entity "Tag" declared by both "demo-pack" and "base-pack"');
    expect(withBase({ relKinds: { LABELLED: 'tagged' } })).toThrow('relKind "TAGGED" declared by both "demo-pack" and "base-pack"');
    expect(withBase({ relKinds: { TAGGED: 'labelled' } })).toThrow('relKind "TAGGED" declared by both "demo-pack" and "base-pack"');
  });

  it('names entity types by their values in EntityName, the type names rows carry', () => {
    // abuddy.json requires an entity's key to be its type name; the generated names follow the value regardless
    const base = { ...dependency({}), types: { entities: { Tag: 'Tag' }, relKinds: {} } };
    const ears = generate({ entities: { Memo: 'memo' }, dependencies: { 'base-pack': '*' } }, { 'base-pack': base })['src/__generated__/ears.ts'];
    const names = ears.match(/export type EntityName = ([^;]*);/)![1];
    expect(names).toContain("'memo'");
    expect(names).not.toContain("'Memo'");
    expect(names).toContain("'Tag'");
    expect(names).toContain("'Relation'");
  });

  it("registers only the pack's own entities and relation kinds, not its dependencies' or the SDK's", () => {
    const base = { ...dependency({}), types: { entities: { Tag: 'Tag' }, relKinds: { TAGGED: 'tagged' } } };
    const entry = generate({ entities: { Memo: 'Memo' }, relKinds: { PINNED: 'pinned' }, dependencies: { 'base-pack': '*' } }, { 'base-pack': base })['src/__generated__/pack-entry.ts'];
    expect(entry).toContain('entities: {"Memo":"Memo"},');
    expect(entry).toContain('relKinds: {"PINNED":"pinned"},');
  });

  it("rejects a pack's own declaration of the SDK's names", () => {
    expect(() => generate({ entities: { Relation: 'Relation' } })).toThrow(/entity "Relation" is defined by the SDK/);
    expect(() => generate({ entities: { Action: 'Action' } })).toThrow(/entity "Action" is defined by the SDK/);
    expect(() => generate({ relKinds: { TRANSITIONS_TO: 'transitions_to' } })).toThrow(/relKind "TRANSITIONS_TO": "transitions_to" is defined by the SDK/);
  });
});

describe('generated seeders', () => {
  it('registers the generic seeder with its format settings, and SDK seeders for specialty keys', () => {
    const files = generate({
      entities: { Memo: 'Memo' },
      seedFormats: {
        memos: { format: 'markdown-tree', entity: 'Memo', identity: ['title', 'parent'], tree: { relKind: 'has_memo' }, media: 'media' },
        help: { compiler: 'src/seeds/compilers/help.ts' },
      },
      boot: { seed: {
        actions: 'src/seeds/actions',
        flows: { path: 'src/seeds/flows' },
        memos: { path: 'src/seeds/memos', format: 'memos' },
        help: { path: 'src/seeds/help', format: 'help' },
      } },
    });
    const seeders = files['src/__generated__/seeders.ts'];
    expect(seeders).toContain(`export const seeders: Seeder[] = [\n  createSeeder({ key: 'actions', entities: ['Action'], identity: ['label'] }),`);
    expect(seeders).toContain('  createFlowSeeder(),');
    expect(seeders).toContain('  createSeeder({"key":"memos","entities":["Memo"],"identity":["title","parent"],"relKind":"has_memo","media":true}),');
    expect(seeders).not.toContain('help');
    expect(files['src/__generated__/pack-entry.ts']).toContain('seedKeys: ["actions", "flows", "memos"],');
  });

  it("uses a dependency's format settings for an entry naming it", () => {
    const deps = { 'base-pack': { ...dependency({ seedFormats: { notes: { format: 'markdown-tree', entity: 'Note', identity: ['title'], tree: { branch: 'index.md' } } } }), types: { entities: { Note: 'Note' }, relKinds: {} } } };
    const seeders = generate({ dependencies: { 'base-pack': '*' }, boot: { seed: { team: { path: 'src/seeds/team', format: 'base-pack:notes' } } } }, deps)['src/__generated__/seeders.ts'];
    expect(seeders).toContain('  createSeeder({"key":"team","entities":["Note"],"identity":["title"]}),');
    expect(() => generate({ dependencies: { 'base-pack': '*' }, boot: { seed: { team: { path: 'p', format: 'base-pack:missing' } } } }, deps))
      .toThrow('Seed "team": dependency "base-pack" has no format "missing"');
  });

  it("registers a pack seeder module under a seed key that isn't an identifier", () => {
    const seeders = generate({ boot: { seed: { 'my-memos': { seeder: 'src/seeds/memos.ts' } } } })['src/__generated__/seeders.ts'];
    expect(seeders).toContain("import { apply as __seeder_my_memos } from '../seeds/memos.ts';");
    expect(seeders).toContain('  { key: "my-memos", apply: __seeder_my_memos },');
  });

  it("registers a pack seeder module for a format entry naming one, and boot-seeds the compiled entry", () => {
    const files = generate({
      seedFormats: { settings: { compiler: 'src/seeds/compilers/settings.ts' } },
      boot: { seed: { settings: { path: 'src/seeds/settings.ts', format: 'settings', seeder: 'src/seeds/settings-seeder.ts' } } },
    });
    const seeders = files['src/__generated__/seeders.ts'];
    expect(seeders).toContain("import { apply as __seeder_settings } from '../seeds/settings-seeder.ts';");
    expect(seeders).toContain('  { key: "settings", apply: __seeder_settings },');
    expect(seeders).not.toContain('createSeeder');
    expect(files['src/__generated__/pack-entry.ts']).toContain('seedKeys: ["settings"],');
  });

  it('accepts format entities from the SDK and dependencies, and rejects one nobody declares', () => {
    const deps = { 'base-pack': { ...dependency({}), types: { entities: { Note: 'Note' }, relKinds: {} } } };
    expect(() => generate({ dependencies: { 'base-pack': '*' }, seedFormats: {
      notes: { format: 'markdown-tree', entity: 'Note' },
      actions2: { format: 'json', entity: 'Action', identity: ['label'] },
    } }, deps)).not.toThrow();
    // Unused formats are checked too: dependents may use them
    expect(() => generate({ seedFormats: { notes: { format: 'json', entity: 'Memo' } } }))
      .toThrow(`Seed format "notes": entity "Memo" isn't declared by this pack, its dependencies or the SDK`);
    expect(() => generate({ seedFormats: { notes: { format: 'markdown-tree', entity: 'Action', tree: { branchEntity: 'Folder' } } } }))
      .toThrow(`entity "Folder" isn't declared`);
  });

  it("registers the pack's seed hooks by entity type", () => {
    write('src/memo-hooks.ts', 'export const memoSeedHooks = {};');
    const entry = generate({ entities: { Memo: 'Memo' }, seedHooks: { Memo: 'src/memo-hooks.ts#memoSeedHooks' } })['src/__generated__/pack-entry.ts'];
    expect(entry).toContain("import { memoSeedHooks as __seedHooks_0 } from '../memo-hooks.ts';");
    expect(entry).toContain('seedHooks: { "Memo": __seedHooks_0 },');
    expect(() => generate({ entities: { Memo: 'Memo' }, seedHooks: { Memo: 'src/memo-hooks.ts#missing' } }))
      .toThrow(`Seed hooks for "Memo": src/memo-hooks.ts doesn't export "missing"`);
  });

  it('names seed hook imports validly whatever the entity is called', () => {
    write('src/hooks.ts', 'export const docHooks = {};\nexport const noteHooks = {};');
    const files = generate({
      entities: { 'team-doc': 'team-doc', 'team.note': 'team.note' },
      seedHooks: { 'team-doc': 'src/hooks.ts#docHooks', 'team.note': 'src/hooks.ts#noteHooks' },
    });
    for (const file of ['src/__generated__/pack-entry.ts', 'src/__generated__/seed-runtime.ts']) {
      expect(() => transformSync(files[file], { loader: 'ts' }), file).not.toThrow();
      expect(files[file]).toContain('seedHooks: { "team-doc": __seedHooks_0, "team.note": __seedHooks_1 },');
    }
  });
});

describe('generated flow helpers', () => {
  const helpers = (exports: string[], name: string) => ({ exports, module: `// ${name} module`, types: `// ${name} types` });

  it("types a step helper's options with the step's DSL node fields", () => {
    write('src/steps/pour/types.ts', "export interface DSLPourNode { type: 'pour'; cup: string; size?: 'small' | 'large'; [key: string]: unknown }\n");
    const files = generate({ steps: { register: 'src/steps/register.ts', definitions: [{ type: 'pour', path: 'src/steps/pour', dsl: { primaryField: 'cup' } }] } });

    expect(files['src/__generated__/flow-helpers.ts']).toContain(
      "export function pour(cup: string, opts?: { [K in keyof DSLPourNode as K extends 'type' | 'cup' ? never : K]: DSLPourNode[K] }): DSLStepNode {",
    );
  });

  it('names helpers in camelCase, splitting step types and track fields on - and _', () => {
    write('src/steps/pour-cup/types.ts', "export interface DSLPourCupNode { type: 'pour-cup'; cup: string; [key: string]: unknown }\n");
    write('src/steps/every-day/build.ts', "export const everyDay = { trigger: { trackField: 'every_day' } };\n");
    const files = generate({ steps: { register: 'src/steps/register.ts', definitions: [
      { type: 'pour-cup', path: 'src/steps/pour-cup', dsl: { primaryField: 'cup' } },
      { type: 'keep_alive', path: 'src/steps/keep-alive', dsl: {} },
      { type: 'stop-now', path: 'src/steps/stop-now', dsl: { defaultLabel: 'Stop' } },
      { type: 'every-day', path: 'src/steps/every-day', kind: 'trigger' },
    ] } });
    const flowHelpers = files['src/__generated__/flow-helpers.ts'];

    expect(flowHelpers).toContain('export function pourCup(cup: string, opts?:');
    expect(flowHelpers).toContain("return { type: 'pour-cup', cup, ...opts };");
    expect(flowHelpers).toContain('export function keepAlive(label?: string): DSLStepNode {');
    expect(flowHelpers).toContain("export function stopNow(label: string = 'Stop'): DSLStepNode {");
    expect(flowHelpers).toContain('export function everyDay(every_day: string, exits: DSLStepNode[][], label?: string): Track {');
    const { diagnostics } = ts.transpileModule(flowHelpers, { reportDiagnostics: true, compilerOptions: { module: ts.ModuleKind.ESNext } });
    expect(diagnostics?.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n'))).toEqual([]);
  });

  it("re-exports each dependency's flow helpers from the module its snapshot carries, except names already exported", () => {
    write('src/steps/pour/types.ts', "export interface DSLPourNode { type: 'pour'; cup: string }\n");
    const files = generate(
      { steps: { register: 'src/steps/register.ts', definitions: [{ type: 'pour', path: 'src/steps/pour', dsl: { primaryField: 'cup' } }] } },
      {
        'base-pack': { ...dependency({}), flowHelpers: helpers(['branch', 'entry', 'on', 'pour', 'schedule'], 'base-pack') },
        'other-pack': { ...dependency({ id: 'other-pack' }), flowHelpers: helpers(['branch', 'every'], 'other-pack') },
        'untyped-pack': dependency({ id: 'untyped-pack' }),
      },
    );
    const flowHelpers = files['src/__generated__/flow-helpers.ts'];

    expect(flowHelpers).toContain("export { branch, schedule } from './deps/base-pack.flow-helpers.js';");
    expect(flowHelpers).toContain("export { every } from './deps/other-pack.flow-helpers.js';");
    expect(flowHelpers).not.toContain('untyped-pack');
    expect(flowHelpers).not.toContain('Record<string, unknown>');
    expect(files['src/__generated__/deps/base-pack.flow-helpers.js']).toContain('// base-pack module');
    expect(files['src/__generated__/deps/base-pack.flow-helpers.d.ts']).toContain('// base-pack types');
  });
});

/**
 * What `PACK_SNAPSHOT_FORMAT` covers: the snapshot's fields, the manifest's, the provenance kinds, the facade exports
 * a dependent's generated code imports, and the registration the app loads. When this fails, the snapshot's contract changed. If a CLI on the
 * other side would misread the change (anything removed, renamed or reshaped) and the last release shipped
 * this format number, bump it; then update the expectation. A pure addition every reader ignores needs only
 * the expectation.
 */
describe('the snapshot format', () => {
  // Each typed against its interface, so adding, renaming or removing a field fails the typecheck until it is listed
  const SNAPSHOT_FIELDS: Record<keyof PackSnapshot, true> = {
    types: true, defs: true, manifest: true, format: true, sdkVersion: true, provenance: true, flowHelpers: true,
  };
  /** The snapshot's manifest, which a dependent's codegen reads (features, services, seed formats, version…) */
  const MANIFEST_FIELDS: Record<keyof PackManifest, true> = {
    $manifestVersion: true, $schema: true, artifacts: true, blocks: true, boot: true, builtIn: true, commands: true,
    dependencies: true, description: true, dsl: true, entities: true, entityShapes: true, help: true, fe: true, features: true,
    hostVersion: true, id: true, license: true, migrations: true, name: true, packServices: true,
    permissions: true, relKinds: true, seedFormats: true, seedHooks: true, settingsSections: true, steps: true, version: true,
  };
  const MANIFEST_FEATURE_FIELDS: Record<keyof PackFeatureEntry, true> = {
    designation: true, id: true, plugin: true, references: true, repositories: true, services: true,
    settings: true, system: true, typesEntry: true,
  };
    const MANIFEST_SYSTEM_FIELDS: Record<keyof PackSystemEntry, true> = { contract: true, entry: true, events: true };
  const MANIFEST_SYSTEM_EVENTS_FIELDS: Record<keyof NonNullable<PackSystemEntry['events']>, true> = { incoming: true };
  const MANIFEST_PLUGIN_FIELDS: Record<keyof PackPluginEntry, true> = { contract: true, default: true, entry: true };
  /** A dependency's seed formats, which a dependent's `boot.seed` compiles its own sources with */
  const SEED_FORMAT_FIELDS: Record<keyof SeedFormatConfig, true> = {
    compiler: true, entity: true, fields: true, format: true, identity: true, media: true, tree: true,
  };
  const SEED_TREE_FIELDS: Record<keyof NonNullable<SeedFormatConfig['tree']>, true> = { branch: true, branchEntity: true, relKind: true };
  const SEED_FIELD_FIELDS: Record<keyof NonNullable<SeedFormatConfig['fields']>[string], true> = { default: true, from: true, type: true };
  /** The registration the runtime bundle exports, which the app loads */
  const REGISTRATION_FIELDS: Record<keyof PackRegistration, true> = {
    id: true, features: true, services: true, ears: true, repositories: true, boot: true, migrations: true, steps: true,
    artifacts: true, blocks: true, seedHooks: true, seeders: true, commands: true, help: true, settingsSections: true,
  };
  const REGISTRATION_FEATURE_FIELDS: Record<keyof PackFeature, true> = {
    designation: true, system: true, plugin: true, services: true, settings: true,
  };
  const REGISTRATION_SYSTEM_FIELDS: Record<keyof PackFeatureSystem, true> = { machine: true, receives: true };
  const REGISTRATION_PLUGIN_FIELDS: Record<keyof PackFeaturePlugin, true> = { receives: true };

  /** Every name generated code imports from a dependency's facade, with a send to one of its plugins */
  function facadeImports(): string[] {
    const deps = { 'base-pack': dependency({ features: [{ id: 'memos', system: { entry: 'x' }, plugin: { entry: writePluginEntry('y') } }] }) };
    const files = generate({ dependencies: { 'base-pack': '1.0.0' }, features: [withPlugin(system('actions'))] }, deps);
    const names = Object.values(files).flatMap((file) => [...file.matchAll(/import type \{ (\w+) as \w+ \} from '\.\/deps\/base-pack\.ts'/g)].map((m) => m[1]));
    return [...new Set(names)].sort();
  }

  it('covers exactly what dependents read', () => {
    expect({
      format: PACK_SNAPSHOT_FORMAT,
      fields: Object.keys(SNAPSHOT_FIELDS).sort(),
      manifest: {
        fields: Object.keys(MANIFEST_FIELDS).sort(),
        feature: Object.keys(MANIFEST_FEATURE_FIELDS).sort(),
        system: Object.keys(MANIFEST_SYSTEM_FIELDS).sort(),
        systemEvents: Object.keys(MANIFEST_SYSTEM_EVENTS_FIELDS).sort(),
        plugin: Object.keys(MANIFEST_PLUGIN_FIELDS).sort(),
        seedFormat: Object.keys(SEED_FORMAT_FIELDS).sort(),
        seedTree: Object.keys(SEED_TREE_FIELDS).sort(),
        seedField: Object.keys(SEED_FIELD_FIELDS).sort(),
      },
      registration: {
        fields: Object.keys(REGISTRATION_FIELDS).sort(),
        feature: Object.keys(REGISTRATION_FEATURE_FIELDS).sort(),
        system: Object.keys(REGISTRATION_SYSTEM_FIELDS).sort(),
        plugin: Object.keys(REGISTRATION_PLUGIN_FIELDS).sort(),
      },
      provenanceKinds: Object.keys(PROVENANCE_KINDS).sort(),
      facadeImports: facadeImports(),
    }).toEqual({
      format: 1,
      fields: ['defs', 'flowHelpers', 'format', 'manifest', 'provenance', 'sdkVersion', 'types'],
      manifest: {
        fields: [
          '$manifestVersion', '$schema', 'artifacts', 'blocks', 'boot', 'builtIn', 'commands', 'dependencies', 'description', 'dsl',
          'entities', 'entityShapes', 'fe', 'features', 'help', 'hostVersion', 'id', 'license', 'migrations', 'name', 'packServices',
          'permissions', 'relKinds', 'seedFormats', 'seedHooks', 'settingsSections', 'steps', 'version',
        ],
        feature: ['designation', 'id', 'plugin', 'references', 'repositories', 'services', 'settings', 'system', 'typesEntry'],
        system: ['contract', 'entry', 'events'],
        systemEvents: ['incoming'],
        plugin: ['contract', 'default', 'entry'],
        seedFormat: ['compiler', 'entity', 'fields', 'format', 'identity', 'media', 'tree'],
        seedTree: ['branch', 'branchEntity', 'relKind'],
        seedField: ['default', 'from', 'type'],
      },
      registration: {
        fields: ['artifacts', 'blocks', 'boot', 'commands', 'ears', 'features', 'help', 'id', 'migrations', 'repositories', 'seedHooks', 'seeders', 'services', 'settingsSections', 'steps'],
        feature: ['designation', 'plugin', 'services', 'settings', 'system'],
        system: ['machine', 'receives'],
        plugin: ['receives'],
      },
      provenanceKinds: ['commands', 'entities', 'plugins', 'relKinds'],
      facadeImports: ['PackEntityShapes', 'PackPluginEvents', 'PackPluginState', 'PackStepNodes', 'PackSystemEvents', 'Repositories', 'Services'],
    });
  });
});

// The barrel is how one feature names another's types (`#generated/types`). A feature may have repositories or
// services and no system at all, and the types its callers need are the ones its repository and service signatures
// use — so what decides is whether it has a types module, not whether it has a system.
describe('generated type barrel', () => {
  it("takes every feature's types module, with or without a system", () => {
    write('src/features/records/be/types.ts', 'export interface RecordRow { id: string }');
    write('src/features/records/be/repository/index.ts', 'export const recordQueries = {};');
    write('src/features/memos/be/types.ts', 'export interface Memo { text: string }');
    writeSystemEntry('memos', "{ type: 'MEMO_ADDED' }");

    const files = generatePackFiles(manifest({
      features: [
        // Data for the rest of the pack, and no system of its own
        { id: 'records', repositories: { recordQueries: 'src/features/records/be/repository/index.ts#recordQueries' } },
        system('memos'),
      ] as PackFeatureEntry[],
    }), { packRoot: root });

    expect(files['src/__generated__/types.ts']).toContain("export type * from '../features/records/be/types.ts';");
    expect(files['src/__generated__/types.ts']).toContain("export type * from '../features/memos/be/types.ts';");
  });

  it('leaves out a feature with no types module, whatever else it has', () => {
    writeSystemEntry('memos', "{ type: 'MEMO_ADDED' }");

    const files = generatePackFiles(manifest({
      features: [system('memos')] as PackFeatureEntry[],
    }), { packRoot: root });

    expect(files['src/__generated__/types.ts']).not.toContain('features/memos/be/types');
  });
});
