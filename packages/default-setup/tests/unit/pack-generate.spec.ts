import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { generate } from '../../../pack-cli/src/commands/generate';

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
  return fs.readFileSync(path.join(tmpDir, '.abuddy', 'generated', 'ears.ts'), 'utf-8');
}

describe('abuddy generate', () => {
  it('creates .abuddy/generated/ears.ts from manifest entities', async () => {
    writeManifest({
      id: 'test-pack',
      name: 'Test Pack',
      version: '0.1.0',
      entities: { Widget: 'Widget', Gadget: 'Gadget' },
      relKinds: {},
    });

    await generate([], tmpDir);

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

    await generate([], tmpDir);

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

    await generate([], tmpDir);

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

    await generate([], tmpDir);

    const output = readGenerated();
    expect(output).toContain("export type EntityId = import('@abuddy/sdk').EARS.EntityId");
    expect(output).toContain("export type Blueprint = import('@abuddy/sdk').EARS.Blueprint");
    expect(output).toContain("export type RoleKind = import('@abuddy/sdk').EARS.RoleKind");
    expect(output).toContain("export type AttrKind = import('@abuddy/sdk').EARS.AttrKind");
  });

  it('emits BaseEntity interface and AllEntities compat export', async () => {
    writeManifest({
      id: 'test-pack',
      name: 'Test Pack',
      version: '0.1.0',
      entities: { Item: 'Item' },
      relKinds: {},
    });

    await generate([], tmpDir);

    const output = readGenerated();
    expect(output).toContain('export interface BaseEntity');
    expect(output).toContain('id: EARS.EntityId');
    expect(output).toContain('entityType: EARS.Entity');
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

    await generate([], tmpDir);

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

    await generate([], tmpDir);

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

    // Create local dep cache
    const depDir = path.join(tmpDir, '.abuddy', 'deps', 'dep-pack');
    fs.mkdirSync(depDir, { recursive: true });
    fs.writeFileSync(path.join(depDir, 'types.json'), JSON.stringify({
      entities: { DepWidget: 'DepWidget' },
      relKinds: { DEP_REL: 'dep_rel' },
    }));

    await generate([], tmpDir);

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

    await generate([], tmpDir);
    const first = readGenerated();

    await generate([], tmpDir);
    const second = readGenerated();

    expect(first).toBe(second);
  });
});
