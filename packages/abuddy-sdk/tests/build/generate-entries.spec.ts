import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { generatePackFiles, PACK_TYPES_DEF } from '../../src/build/generate-entries.ts';
import type { PackManifest, PackSnapshot } from '../../src/build/manifest.ts';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-codegen-'));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function write(file: string, content: string): void {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), content);
}

function manifest(fields: Record<string, unknown>): PackManifest {
  return { id: 'demo-pack', name: 'Demo', version: '1.0.0', ...fields } as unknown as PackManifest;
}

function dependency(fields: Record<string, unknown>, defs: Record<string, string> = { [PACK_TYPES_DEF]: 'export type PackEvents = {};' }): PackSnapshot {
  return { types: { entities: {}, relKinds: {} }, defs, manifest: manifest({ id: 'base-pack', ...fields }) };
}

function generate(fields: Record<string, unknown>, deps: Record<string, PackSnapshot> = {}): Record<string, string> {
  return generatePackFiles(manifest(fields), { packRoot: root, depSnapshots: new Map(Object.entries(deps)) });
}

const system = (id: string, extra: Record<string, unknown> = {}) => ({ id, system: { entry: `src/features/${id}/be/system.ts`, ...extra } });

describe('generated events', () => {
  it('keys each plugin by the systems that send to it', () => {
    const files = generate({ features: [system('actions', { sendsTo: ['flows', 'application'] }), system('flows')] });
    const events = files['src/__generated__/events.ts'];
    expect(events).toContain("'actions': __events_actions;");
    expect(events).toContain("'flows': __events_flows | __events_actions;");
    expect(events).toContain('export type PackEvents = OwnPackEvents & Omit<HostPluginEvents, keyof OwnPackEvents>;');
  });

  it('includes a plugin-only feature something sends to', () => {
    const files = generate({ features: [system('notes', { sendsTo: ['sidebar'] }), { id: 'sidebar', plugin: { entry: 'x', label: 'S', icon: 'X' } }] });
    expect(files['src/__generated__/events.ts']).toContain("'sidebar': __events_notes;");
  });

  it("intersects each dependency's plugin events and accepts its plugins as targets", () => {
    const files = generate(
      { features: [system('memos', { sendsTo: ['threads'] })] },
      { 'base-pack': dependency({ features: [{ id: 'threads', plugin: { entry: 'x', label: 'T', icon: 'X' } }] }) },
    );
    const events = files['src/__generated__/events.ts'];
    expect(events).toContain("import type { PackEvents as __dep_base_pack_PackEvents } from './deps/base-pack.js';");
    expect(events).toContain('export type PackEvents = OwnPackEvents & Omit<__dep_base_pack_PackEvents, keyof OwnPackEvents> & Omit<HostPluginEvents, keyof OwnPackEvents>;');
    expect(files['src/__generated__/deps/base-pack.d.ts']).toContain('export type PackEvents = {};');
  });

  it('rejects a sendsTo target no pack or host provides', () => {
    expect(() => generate({ features: [system('memos', { sendsTo: ['nowhere'] })] }))
      .toThrow('Feature "memos": system.sendsTo names "nowhere"');
  });
});

describe('dependency types in .abuddy/generated/types.ts', () => {
  it("re-exports a dependency's types by their exported names, not the facade names", async () => {
    const { emitDepTypes } = await import('../../src/build/generate-entries.ts');
    const types = emitDepTypes(new Map([['base-pack', { types: { entities: {}, relKinds: {} }, defs: {
      [PACK_TYPES_DEF]: 'type Local = {};\ntype TagEntity = {};\nexport type { Local as PackEntityShapes, TagEntity };\n',
    } }]]));
    expect(types).toContain("export type { TagEntity } from '../deps/base-pack/defs/pack-types.js';");
    expect(types).not.toMatch(/Local|PackEntityShapes/);
  });
});

describe('generated entity shapes', () => {
  it('imports own shapes under aliases and dependency shapes from their facade types', () => {
    write('src/features/memos/be/types.ts', 'export interface ItemEntity { text: string }\n');
    const files = generate(
      { entities: { Memo: 'Memo' }, entityShapes: { Memo: { source: 'src/features/memos/be/types.ts', type: 'ItemEntity' } } },
      { 'base-pack': dependency({}) },
    );
    const ears = files['src/__generated__/ears.ts'];
    expect(ears).toContain("import type { ItemEntity as __shape_Memo } from '../features/memos/be/types.js';");
    expect(ears).toContain("'Memo': __shape_Memo;");
    expect(ears).toContain('export type PackShapes = SdkEntityShapes & OwnEntityShapes & __dep_base_pack_PackEntityShapes;');
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

describe('generated repositories', () => {
  it('types repositories from their declarations and registers them from the backend entry', () => {
    write('src/features/memos/be/repository.ts', 'export const memoQueries = {};\n');
    const files = generate({ features: [{ ...system('memos'), repositories: { memoQueries: 'src/features/memos/be/repository.ts#memoQueries' } }] });
    expect(files['src/__generated__/repository.ts']).toContain("import type { memoQueries as __repo_memoQueries } from '../features/memos/be/repository.js';");
    expect(files['src/__generated__/repository.ts']).toContain('memoQueries: typeof __repo_memoQueries;');
    expect(files['src/__generated__/repositories.ts']).toContain("registerRepository('memoQueries', __repo_memoQueries);");
    expect(files['src/__generated__/pack-entry.ts']).toContain("import './repositories.js';");
  });

  it('fails on a repository export that does not exist', () => {
    write('src/repo.ts', 'export const other = {};\n');
    expect(() => generate({ features: [{ ...system('memos'), repositories: { memoQueries: 'src/repo.ts#memoQueries' } }] }))
      .toThrow('Repository "memoQueries" (feature "memos"): src/repo.ts doesn\'t export "memoQueries"');
  });

  it('writes no registration module for a pack without repositories', () => {
    const files = generate({ features: [system('memos')] });
    expect(files['src/__generated__/repositories.ts']).toBeUndefined();
    expect(files['src/__generated__/pack-entry.ts']).not.toContain('repositories.js');
  });
});

describe('generated services', () => {
  it('aliases service imports, so a service named "services" does not shadow the export', () => {
    write('src/services.ts', 'export const value = 1;\n');
    const services = generate({ features: [{ id: 'memos', services: { services: 'src/services.ts' } }] })['src/__generated__/services.ts'];
    expect(services).toContain("import * as __service_services from '../services.js';");
    expect(services).toContain('  services: __service_services,');
    expect(services).toContain('export const services = sdkServices');
  });

  it("intersects dependencies' services and types repository with the pack's repositories", () => {
    const services = generate({}, { 'base-pack': dependency({}) })['src/__generated__/services.ts'];
    expect(services).toContain("Omit<HostServices, 'repository'> & { repository: Repositories } & Omit<__dep_base_pack_Services, 'repository'>");
  });
});

describe('generated imports', () => {
  it('names side-effect imports with .js', () => {
    const files = generate({ features: [system('memos')] });
    expect(files['src/__generated__/pack-entry.ts']).toContain("import './seeders.js';");
    expect(files['src/__generated__/pack-entry.ts']).not.toMatch(/import '\.\/seeders';/);
  });

  it('keeps dots in extensionless names and normalizes backslashes', () => {
    write('src/features/memos/be/memo.types.ts', 'export interface MemoEntity { text: string }\n');
    const ears = generate({ entityShapes: { Memo: { source: 'src\\features\\memos\\be\\memo.types', type: 'MemoEntity' } } })['src/__generated__/ears.ts'];
    expect(ears).toContain("from '../features/memos/be/memo.types.js';");
  });
});
