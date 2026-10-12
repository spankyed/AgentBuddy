import * as sdkBuild from '@apackdev/sdk/build';
import { _declarationRevision } from '@apackdev/sdk/build';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { generateEntries } from '../../src/commands/generate-entries';
import { PACK_SNAPSHOT_FORMAT, type PackSnapshot, type PackTypeManifest } from '@apackdev/sdk/build';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pack-generate-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeManifest(manifest: Record<string, unknown>) {
  fs.writeFileSync(path.join(tmpDir, 'apack.json'), JSON.stringify(manifest));
}

function readGenerated(): string {
  return fs.readFileSync(path.join(tmpDir, 'src', '__generated__', 'ears.ts'), 'utf-8');
}

describe('apack pack generate-entries', () => {
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
    // Relation kinds stay open; the SDK's own are named
    expect(output).toMatch(/export type RelKind =[\s\S]*\(string & \{\}\)/);
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

    const snapshot: PackSnapshot = { declarationRevision: _declarationRevision({ id: 'dep-pack', name: 'Dep Pack', version: '0.1.0' }),
      format: PACK_SNAPSHOT_FORMAT,
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

/**
 * The stamp records what the last run read *and* what it wrote. Recording only the inputs meant deleting a
 * generated file left the hash matching, so the command reported "inputs unchanged, skipping" over a tree it
 * had not made, and the pack stayed unbuildable until someone passed `--force`.
 */
describe('the inputs stamp', () => {
  const generated = (name: string) => path.join(tmpDir, 'src', '__generated__', name);

  it('holds its lock until async generation settles and preserves files and stamp after rejection', async () => {
    writeManifest({ id: 'test-pack', name: 'Test', version: '0.1.0' });
    await generateEntries([], tmpDir);
    const output = fs.readFileSync(generated('settings.ts'), 'utf8');
    const stamp = fs.readFileSync(generated('.inputs-hash'), 'utf8');
    let refuse!: (error: Error) => void;
    const pending = new Promise<Record<string, string>>((_, reject) => { refuse = reject; });
    const spy = vi.spyOn(sdkBuild, 'generatePackFiles').mockReturnValueOnce(pending);
    try {
      const result = expect(generateEntries(['--force'], tmpDir)).rejects.toThrow('type generation failed');
      await vi.waitFor(() => expect(fs.existsSync(generated('.generating.lock'))).toBe(true));
      expect(fs.readFileSync(generated('.inputs-hash'), 'utf8')).toBe(stamp);
      refuse(new Error('type generation failed'));
      await result;
      expect(fs.existsSync(generated('.generating.lock'))).toBe(false);
      expect(fs.readFileSync(generated('settings.ts'), 'utf8')).toBe(output);
      expect(fs.readFileSync(generated('.inputs-hash'), 'utf8')).toBe(stamp);
    } finally {
      spy.mockRestore();
    }
    await generateEntries(['--force'], tmpDir);
    expect(fs.existsSync(generated('.generating.lock'))).toBe(false);
  });


  it('rechecks changed module exports outside src without forcing codegen', async () => {
    writeManifest({ id: 'test-pack', name: 'Test', version: '0.1.0', extensions: { services: { service: 'modules/service.ts#service' } } });
    fs.mkdirSync(path.join(tmpDir, 'modules'));
    const file = path.join(tmpDir, 'modules/service.ts');
    fs.writeFileSync(file, 'export const service = { before: () => 1 };');
    await generateEntries([], tmpDir);
    const output = generated('services.ts');
    expect(fs.readFileSync(output, 'utf8')).toContain('service as __service_service');
    fs.writeFileSync(file, 'export const renamed = { after: () => 2 };');
    await expect(generateEntries([], tmpDir)).rejects.toThrow('service');
  });

  it('regenerates a file that was deleted, rather than reporting the tree unchanged', async () => {
    writeManifest({ id: 'test-pack', name: 'Test Pack', version: '0.1.0', entities: { Widget: 'Widget' }, relKinds: {} });
    await generateEntries([], tmpDir);
    expect(fs.existsSync(generated('ears.ts'))).toBe(true);

    fs.rmSync(generated('ears.ts'));
    const said: string[] = [];
    const log = vi.spyOn(console, 'log').mockImplementation((m) => { said.push(String(m)); });
    await generateEntries([], tmpDir);
    log.mockRestore();

    expect(fs.existsSync(generated('ears.ts')), 'the missing file is back').toBe(true);
    expect(said.join('\n'), 'and it did not claim the tree was current').not.toMatch(/inputs unchanged/);
  });

  it('still skips when every recorded file is there', async () => {
    writeManifest({ id: 'test-pack', name: 'Test Pack', version: '0.1.0', entities: { Widget: 'Widget' }, relKinds: {} });
    await generateEntries([], tmpDir);

    const said: string[] = [];
    const log = vi.spyOn(console, 'log').mockImplementation((m) => { said.push(String(m)); });
    await generateEntries([], tmpDir);
    log.mockRestore();
    expect(said.join('\n')).toMatch(/inputs unchanged/);
  });

  it('ignores Markdown that is not a declared help input', async () => {
    writeManifest({ id: 'test-pack', name: 'Test', version: '0.1.0' });
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    const prose = path.join(tmpDir, 'src/README.md');
    fs.writeFileSync(prose, 'Draft');
    await generateEntries([], tmpDir);
    fs.writeFileSync(prose, 'Updated prose');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await generateEntries([], tmpDir);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('inputs unchanged'));
    log.mockRestore();
  });

  // The case that makes the list recorded rather than fixed: a pack with no plugins never writes `fe.ts`,
  // and an expectation hard-coded from a fuller pack would call it stale on every run, forever.
  it('does not treat a file this pack never generates as missing', async () => {
    writeManifest({ id: 'test-pack', name: 'Test Pack', version: '0.1.0', entities: { Widget: 'Widget' }, relKinds: {} });
    await generateEntries([], tmpDir);
    expect(fs.existsSync(generated('fe.ts')), 'no plugins, so no fe.ts').toBe(false);

    const stamp = JSON.parse(fs.readFileSync(generated('.inputs-hash'), 'utf-8')) as { files: string[] };
    expect(stamp.files, 'and it is not recorded as an output').not.toContain('src/__generated__/fe.ts');

    const said: string[] = [];
    const log = vi.spyOn(console, 'log').mockImplementation((m) => { said.push(String(m)); });
    await generateEntries([], tmpDir);
    log.mockRestore();
    expect(said.join('\n')).toMatch(/inputs unchanged/);
  });
});

it('regenerates help for Markdown edits, additions and removals, keeping valid output after an invalid edit', async () => {
  writeManifest({ id: 'test-pack', name: 'Test', version: '0.1.0', extensions: { help: { path: 'docs/help' } } });
  const help = path.join(tmpDir, 'docs/help');
  fs.mkdirSync(help, { recursive: true });
  const file = path.join(help, 'start.md');
  const entry = path.join(tmpDir, 'src/__generated__/pack-entry.ts');
  fs.writeFileSync(file, '# Start\nFirst body');
  await generateEntries([], tmpDir);
  expect(fs.readFileSync(entry, 'utf8')).toContain('First body');
  fs.writeFileSync(file, '# Start\nUpdated body');
  await generateEntries([], tmpDir);
  expect(fs.readFileSync(entry, 'utf8')).toContain('Updated body');
  fs.writeFileSync(path.join(help, 'second.md'), '# Second\nSecond body');
  await generateEntries([], tmpDir);
  expect(fs.readFileSync(entry, 'utf8')).toContain('Second body');
  fs.unlinkSync(path.join(help, 'second.md'));
  await generateEntries([], tmpDir);
  expect(fs.readFileSync(entry, 'utf8')).not.toContain('Second body');
  const valid = fs.readFileSync(entry, 'utf8');
  fs.writeFileSync(file, 'Missing title');
  await expect(generateEntries([], tmpDir)).rejects.toThrow(/H1/);
  expect(fs.readFileSync(entry, 'utf8')).toBe(valid);
});
