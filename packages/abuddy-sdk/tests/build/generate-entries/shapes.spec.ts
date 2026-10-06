// The typed surface codegen derives from a manifest.
//
// Entity shapes, feature settings, repositories and services — the declarations a pack compiles against,
// and what happens when two features name one service.
//
// One of five files split from a 1,365-line original; `_support/pack.ts` holds the fixture and why.
//
// @slow: 24 cases, every one a temp pack and a full codegen pass — the file 6.3-9.7s
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
import { entitiesWithoutShapes } from '../../../src/build/generate-entries.ts';
import { setupPackFixture, dependency, facade, generate, system, write } from './_support/pack.ts';

setupPackFixture();

describe('generated entity shapes', () => {
  it('imports own shapes under aliases and dependency shapes from their facade types', () => {
    write('src/features/memos/be/types.ts', 'export interface ItemEntity { text: string }\n');
    const files = generate(
      { entities: { Memo: 'Memo' }, entityShapes: { Memo: { source: 'src/features/memos/be/types.ts', type: 'ItemEntity' } } },
      { 'base-pack': dependency({}) },
    );
    const ears = files['src/__generated__/ears.ts'];
    expect(ears).toContain("import type { ItemEntity as __shape_Memo } from '../features/memos/be/types.ts';");
    expect(ears).toContain("'Memo': __shape_Memo;");
    expect(ears).toContain("export type PackShapes = Omit<SdkEntityShapes & OwnEntityShapes & __dep_base_pack_PackEntityShapes, 'Node'> & {");
  });

  it("reads Node rows as the step node types of the pack and its dependencies, NodeBase when none define any", () => {
    write('src/steps/ping/types.ts', "import type { NodeBase } from '@abuddy/sdk';\nexport interface PingNode extends NodeBase { nodeType: 'ping' }\n");
    const withSteps = generate(
      { steps: { register: 'src/steps/register.ts', definitions: [{ type: 'ping', path: 'src/steps/ping' }] } },
      { 'base-pack': dependency({}) },
    )['src/__generated__/ears.ts'];
    expect(withSteps).toContain("import type { NodeEntity } from './types.ts';");
    expect(withSteps).toContain("import type { PackStepNodes as __dep_base_pack_PackStepNodes } from './deps/base-pack.ts';");
    expect(withSteps).toContain('export type PackStepNodes = NodeEntity | __dep_base_pack_PackStepNodes;');
    expect(withSteps).toContain("Node: [PackStepNodes] extends [never] ? SdkEntityShapes['Node'] : PackStepNodes;");

    const withoutSteps = generate({}, { 'base-pack': dependency({}) })['src/__generated__/ears.ts'];
    expect(withoutSteps).not.toContain("import type { NodeEntity }");
    expect(withoutSteps).toContain('export type PackStepNodes = never | __dep_base_pack_PackStepNodes;');
  });

  it('fails when a declared shape type is not exported', () => {
    write('src/types.ts', 'interface ItemEntity { text: string }\n');
    expect(() => generate({ entities: { Memo: 'Memo' }, entityShapes: { Memo: { source: 'src/types.ts', type: 'ItemEntity' } } }))
      .toThrow('Entity shape "Memo": src/types.ts doesn\'t export a type named "ItemEntity"');
  });

  it("fails when a pack redeclares the SDK's TNode shape", () => {
    write('src/types.ts', 'export interface MyTNode { x: string }\n');
    expect(() => generate({ entityShapes: { TNode: { source: 'src/types.ts', type: 'MyTNode' } } }))
      .toThrow("the SDK declares this entity's shape");
  });

  it('accepts a shape exported by name from a list', () => {
    write('src/types.ts', 'interface ItemEntity { text: string }\nexport type { ItemEntity };\n');
    expect(() => generate({ entityShapes: { Memo: { source: 'src/types.ts', type: 'ItemEntity' } } })).not.toThrow();
  });
});

describe('generated feature settings', () => {
  it("passes each feature's settings module to its registration, which registers them as defaults", () => {
    write('src/features/memos/settings.ts', 'export default { plugins: { memos: {} } };\n');
    const entry = generate({ features: [{ ...system('memos'), settings: 'src/features/memos/settings.ts' }, system('todos')] })['src/__generated__/pack-entry.ts'];
    expect(entry).toContain("import __settings_Memos from '../features/memos/settings.ts';");
    expect(entry).toContain("    'memos': {\n      system: packSystem(__system_memos),\n      services: [],\n      settings: __settings_Memos,\n    }");
    expect(entry).toContain("    'todos': {\n      system: packSystem(__system_todos),\n      services: [],\n    }");
  });

  it('fails on a settings module that is missing or has no default export', () => {
    expect(() => generate({ features: [{ ...system('memos'), settings: 'src/settings.ts' }] }))
      .toThrow('Feature "memos": no settings file found at src/settings.ts');
    write('src/settings.ts', 'export const settings = {};\n');
    expect(() => generate({ features: [{ ...system('memos'), settings: 'src/settings.ts' }] }))
      .toThrow('Feature "memos": settings src/settings.ts has no default export');
  });
});

describe('generated repositories', () => {
  it('types repositories from their declarations and puts them in the registration, registering nothing on import', () => {
    write('src/features/memos/be/repository.ts', 'export const memoQueries = {};\n');
    const files = generate({ features: [{ ...system('memos'), repositories: { memoQueries: 'src/features/memos/be/repository.ts#memoQueries' } }] });
    expect(files['src/__generated__/repository.ts']).toContain("import type { memoQueries as __repo_memoQueries } from '../features/memos/be/repository.ts';");
    expect(files['src/__generated__/repository.ts']).toContain('memoQueries: typeof __repo_memoQueries;');
    expect(files['src/__generated__/repositories.ts']).toContain('  memoQueries: __repo_memoQueries,');
    expect(files['src/__generated__/pack-entry.ts']).toContain("import { repositories } from './repositories.ts';");
    expect(files['src/__generated__/pack-entry.ts']).toContain('  repositories,\n');
  });

  it('accepts a repository exported through a barrel', () => {
    write('src/memos/queries.ts', 'export const memoQueries = {};\n');
    write('src/memos/index.ts', "export * from './queries';\n");
    expect(generate({ features: [{ ...system('memos'), repositories: { memoQueries: 'src/memos#memoQueries' } }] })['src/__generated__/repositories.ts'])
      .toContain("import { memoQueries as __repo_memoQueries } from '../memos/index.ts';");
  });

  it('fails on a repository export that does not exist', () => {
    write('src/repo.ts', 'export const other = {};\n');
    expect(() => generate({ features: [{ ...system('memos'), repositories: { memoQueries: 'src/repo.ts#memoQueries' } }] }))
      .toThrow('Repository "memoQueries" (feature "memos"): src/repo.ts doesn\'t export "memoQueries"');
  });

  it('writes no repositories module for a pack without repositories', () => {
    const files = generate({ features: [system('memos')] });
    expect(files['src/__generated__/repositories.ts']).toBeUndefined();
    expect(files['src/__generated__/pack-entry.ts']).not.toContain('repositories');
  });

  it("fails on a repository name a dependency declares, naming both packs: the app would refuse to register it", () => {
    write('src/features/memos/be/repository.ts', 'export const memoQueries = {};\n');
    const deps = { 'base-pack': dependency({ features: [{ ...system('memos'), repositories: { memoQueries: 'src/repo.ts#memoQueries' } }] }) };
    expect(() => generate({ features: [{ ...system('memos'), repositories: { memoQueries: 'src/features/memos/be/repository.ts#memoQueries' } }] }, deps))
      .toThrow('Repository "memoQueries" (feature "memos") is declared by "base-pack", which this pack depends on');
  });

  it("accepts a repository name no dependency declares", () => {
    write('src/features/memos/be/repository.ts', 'export const memoQueries = {};\n');
    // A different name to the pack's: equal names are the case above, which throws
    const deps = { 'base-pack': dependency({ features: [{ ...system('memos'), repositories: { tagQueries: 'src/repo.ts#tagQueries' } }] }) };
    expect(() => generate({ features: [{ ...system('memos'), repositories: { memoQueries: 'src/features/memos/be/repository.ts#memoQueries' } }] }, deps))
      .not.toThrow();
  });
});

describe('service name collisions', () => {
  const withService = (id: string, name: string) => ({ id, services: { [name]: 'src/x.ts#svc' } });

  // Services from dependencies are intersected (_S0 & _S1), which says nothing about a collision:
  // two `db` services merge into an unusable type with no error. The registry refuses the second
  // pack at registration, so without this the report arrives at app start instead of at build.
  it('fails when two dependencies declare the same service name', () => {
    expect(() => generate({ features: [system('brain')] }, {
      'base-pack': dependency({ id: 'base-pack', features: [withService('a', 'db')] }),
      'other-pack': dependency({ id: 'other-pack', features: [withService('b', 'db')] }),
    })).toThrow('Service "db" is declared by both');
  });

  it("fails when this pack declares a name a dependency declares, as commands and repositories do", () => {
    expect(() => generate({ features: [withService('mine', 'db')] }, {
      'base-pack': dependency({ id: 'base-pack', features: [withService('a', 'db')] }),
    })).toThrow('Service "db" is declared by "base-pack"');
  });

  it('covers pack-level services, not only a feature\'s', () => {
    expect(() => generate({ features: [system('brain')] }, {
      'base-pack': dependency({ id: 'base-pack', packServices: { db: 'src/x.ts#svc' } }),
      'other-pack': dependency({ id: 'other-pack', features: [withService('b', 'db')] }),
    })).toThrow('Service "db" is declared by both');
  });

  it('accepts distinct names across dependencies', () => {
    expect(() => generate({ features: [system('brain')] }, {
      'base-pack': dependency({ id: 'base-pack', features: [withService('a', 'db')] }),
      'other-pack': dependency({ id: 'other-pack', features: [withService('b', 'cache')] }),
    })).not.toThrow();
  });
});

describe('generated services', () => {
  const service = (target: string, key = 'memo') => generate({ features: [{ id: 'memos', services: { [key]: target } }] })['src/__generated__/services.ts'];

  it('imports the named service object under an alias, so a service named "services" does not shadow the export', () => {
    write('src/services.ts', 'export const servicesService = { value: 1 };\n');
    const services = service('src/services.ts#servicesService', 'services');
    expect(services).toContain("import { servicesService as __service_services } from '../services.ts';");
    expect(services).toContain('  services: __service_services,');
    expect(services).toContain('export const services = sdkServices');
  });

  it('imports pack-level services the same way', () => {
    write('src/cache/index.ts', 'export const cacheService = { get: (key: string) => key };\n');
    const services = generate({ packServices: { cache: 'src/cache#cacheService' } })['src/__generated__/services.ts'];
    expect(services).toContain("import { cacheService as __service_cache } from '../cache/index.ts';");
    expect(services).toContain('  cache: __service_cache,');
  });

  it('accepts a service object re-exported from another module, a barrel or a multi-line export list', () => {
    write('src/impl.ts', 'class MemoStore { list(): string[] { return []; } }\n/* export const memoService = 1 */\nconst memoService = new MemoStore();\nexport {\n  MemoStore,\n  memoService,\n};\n');
    write('src/reexport.ts', "export { memoService } from './impl';\n");
    write('src/barrel.ts', "export * from './reexport';\n");
    write('src/renamed.ts', "import { memoService as impl } from './impl';\nexport { impl as memoService };\n");
    for (const source of ['src/impl.ts', 'src/reexport.ts', 'src/barrel.ts', 'src/renamed.ts']) {
      expect(service(`${source}#memoService`)).toContain('  memo: __service_memo,');
    }
  });

  it("fails on a target without an export, a missing file or export, and an export that isn't a service object", () => {
    write('src/memo.ts', [
      'export type MemoType = { list(): string[] };',
      'export interface MemoInterface { list(): string[] }',
      'export function createMemoService() { return {}; }',
      'export const memoFactory = () => ({});',
      'export class MemoService {}',
      'const typeOnly = {};',
      'export type { typeOnly };',
      '// export const commented = {};',
    ].join('\n'));
    expect(() => service('src/memo.ts')).toThrow('Service "memo": "src/memo.ts" must name its export, as "path#exportName"');
    expect(() => service('src/missing.ts#memoService')).toThrow('Service "memo": no file found at src/missing.ts');
    expect(() => service('src/memo.ts#memoService')).toThrow('Service "memo": src/memo.ts doesn\'t export "memoService"');
    expect(() => service('src/memo.ts#commented')).toThrow('Service "memo": src/memo.ts doesn\'t export "commented"');
    for (const name of ['MemoType', 'MemoInterface', 'typeOnly']) {
      expect(() => service(`src/memo.ts#${name}`)).toThrow(`Service "memo": src/memo.ts exports "${name}" only as a type, not a value`);
    }
    for (const name of ['createMemoService', 'memoFactory']) {
      expect(() => service(`src/memo.ts#${name}`)).toThrow(`Service "memo": "${name}" in src/memo.ts is a function; export the service object itself`);
    }
    expect(() => service('src/memo.ts#MemoService')).toThrow('Service "memo": "MemoService" in src/memo.ts is a class; export an instance of it');
  });

  it("intersects dependencies' services and types repository with the pack's repositories", () => {
    const services = generate({}, { 'base-pack': dependency({}) })['src/__generated__/services.ts'];
    expect(services).toContain("Omit<HostServices, 'repository' | 'emitter'> & { repository: Repositories; emitter: PackEmitter } & Omit<__dep_base_pack_Services, 'repository' | 'emitter'>");
  });

  it("types the emitter with the pack's events, naming every system <pack>/<feature>", () => {
    const files = generate({ features: [system('memos')] }, { 'base-pack': dependency({ features: [system('calendar')] }, facade()) });
    expect(files['src/__generated__/events.ts']).toContain("export type QualifiedSystemEvents = Qualified<'demo-pack', PackSystemEvents> & Qualified<'base-pack', __dep_base_pack_PackSystemEvents> & HostSystemEvents;");
    const services = files['src/__generated__/services.ts'];
    expect(services).toContain("import type { QualifiedPluginEvents, QualifiedSystemEvents } from './events.ts';");
    expect(services).toContain('  broadcastToPlugin: TypedSendToPlugin<QualifiedPluginEvents>;\n  sendToWindow: TypedSendToWindow<QualifiedPluginEvents>;\n  sendToSystem: TypedSendToSystem<QualifiedSystemEvents>;');
  });
});

describe('entitiesWithoutShapes', () => {
  it("lists the pack's entities with no shape, leaving out those the SDK shapes", () => {
    expect(entitiesWithoutShapes({
      entities: { Memo: 'Memo', Tag: 'Tag', TNode: 'TNode', Relation: 'Relation', Action: 'Action' },
      entityShapes: { Memo: { source: 'src/memo.ts', type: 'MemoEntity' } },
    })).toEqual(['Tag']);
    expect(entitiesWithoutShapes({})).toEqual([]);
  });
});
