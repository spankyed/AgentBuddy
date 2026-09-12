import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { generateEntries } from '../../../abuddy-sdk/src/cli/commands/generate-entries';
import type { PackSnapshot, PackTypeManifest } from '../../../abuddy-sdk/src/build';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pack-generate-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeManifest(manifest: Record<string, unknown>) {
  fs.writeFileSync(path.join(tmpDir, 'abuddy.json'), JSON.stringify(manifest));
}

function readGenerated(): string {
  return fs.readFileSync(path.join(tmpDir, 'src', '__generated__', 'ears.ts'), 'utf-8');
}

describe('abuddy generate-entries', () => {
  it('creates src/__generated__/ears.ts from manifest entities', async () => {
    writeManifest({
      id: 'test-pack',
      name: 'Test Pack',
      version: '0.1.0',
      entities: { Widget: 'Widget', Gadget: 'Gadget' },
      relKinds: {},
    });

    await generateEntries(['--force'], tmpDir);

    const output = readGenerated();
    expect(output).toContain("export const Widget = 'Widget'");
    expect(output).toContain('export type Widget = typeof Widget');
    expect(output).toContain("export const Gadget = 'Gadget'");
    expect(output).toContain('export type Gadget = typeof Gadget');
  });

  it('generates relKind consts and Custom helper', async () => {
    writeManifest({
      id: 'test-pack',
      name: 'Test Pack',
      version: '0.1.0',
      entities: {},
      relKinds: { OWNS: 'owns', FOLLOWS: 'follows' },
    });

    await generateEntries(['--force'], tmpDir);

    const output = readGenerated();
    expect(output).toContain("export const OWNS = 'owns'");
    expect(output).toContain("export const FOLLOWS = 'follows'");
    expect(output).toContain('export const Custom =');
  });

  it('generates Entity union type from all declared entities', async () => {
    writeManifest({
      id: 'test-pack',
      name: 'Test Pack',
      version: '0.1.0',
      entities: { Alpha: 'Alpha', Beta: 'Beta' },
      relKinds: {},
    });

    await generateEntries(['--force'], tmpDir);

    const output = readGenerated();
    expect(output).toContain('export type Entity = Entity.Alpha | Entity.Beta');
  });

  it('delegates infrastructure types to SDK', async () => {
    writeManifest({
      id: 'test-pack',
      name: 'Test Pack',
      version: '0.1.0',
      entities: {},
      relKinds: {},
    });

    await generateEntries(['--force'], tmpDir);

    const output = readGenerated();
    expect(output).toContain("export type EntityId<E extends string = string> = import('@abuddy/sdk').EARS.EntityId<E>");
    expect(output).toContain("export type Blueprint = import('@abuddy/sdk').EARS.Blueprint");
    expect(output).toContain("export type RoleKind = import('@abuddy/sdk').EARS.RoleKind");
    expect(output).toContain("export type AttrKind = import('@abuddy/sdk').EARS.AttrKind");
  });

  it('emits BaseEntity re-export and AllEntities compat export', async () => {
    writeManifest({
      id: 'test-pack',
      name: 'Test Pack',
      version: '0.1.0',
      entities: { Item: 'Item' },
      relKinds: {},
    });

    await generateEntries(['--force'], tmpDir);

    const output = readGenerated();
    // BaseEntity is re-exported from the SDK rather than redeclared per pack,
    // so the shape stays in one place.
    expect(output).toContain('export type BaseEntity');
    expect(output).toContain("import('@abuddy/sdk').BaseEntity");
    expect(output).toContain('export const AllEntities = EARS.Entity');
    expect(output).toContain('export type AllEntities = EARS.Entity');
  });

  it('handles empty entities and relKinds', async () => {
    writeManifest({
      id: 'test-pack',
      name: 'Test Pack',
      version: '0.1.0',
      entities: {},
      relKinds: {},
    });

    await generateEntries(['--force'], tmpDir);

    const output = readGenerated();
    expect(output).toContain('export type Entity = string');
    expect(output).toContain("export type RelKind = (string & {})");
  });

  it('includes AttrKind namespace with Role and RelationDetails', async () => {
    writeManifest({
      id: 'test-pack',
      name: 'Test Pack',
      version: '0.1.0',
      entities: {},
      relKinds: {},
    });

    await generateEntries(['--force'], tmpDir);

    const output = readGenerated();
    expect(output).toContain("export const Role = 'role'");
    expect(output).toContain("export const RelationDetails = 'relationDetails'");
  });

  it('merges dependency type manifests into generated output', async () => {
    writeManifest({
      id: 'test-pack',
      name: 'Test Pack',
      version: '0.1.0',
      entities: { MyEntity: 'MyEntity' },
      relKinds: {},
      dependencies: { 'dep-pack': '>=0.1.0' },
    });

    const snapshot: PackSnapshot = {
      types: {
        entities: { DepWidget: 'DepWidget' },
        relKinds: { DEP_REL: 'dep_rel' },
      },
      defs: {},
      manifest: { id: 'dep-pack', name: 'Dep Pack', version: '0.1.0' },
    };
    const depTypes = new Map<string, PackTypeManifest>([['dep-pack', snapshot.types]]);
    const depSnapshots = new Map<string, PackSnapshot>([['dep-pack', snapshot]]);

    await generateEntries(['--force'], tmpDir, depTypes, depSnapshots);

    const output = readGenerated();
    // Own entity
    expect(output).toContain("export const MyEntity = 'MyEntity'");
    // Dep entity (with source comment)
    expect(output).toContain("export const DepWidget = 'DepWidget'");
    expect(output).toContain('// dep-pack');
    // Dep relKind
    expect(output).toContain("export const DEP_REL = 'dep_rel'");
  });

  it('is idempotent — running twice produces identical output', async () => {
    writeManifest({
      id: 'test-pack',
      name: 'Test Pack',
      version: '0.1.0',
      entities: { A: 'A', B: 'B' },
      relKinds: { R: 'r' },
    });

    await generateEntries(['--force'], tmpDir);
    const first = readGenerated();

    await generateEntries(['--force'], tmpDir);
    const second = readGenerated();

    expect(first).toBe(second);
  });
});
