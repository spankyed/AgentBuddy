// What makes a phase's output reusable, and what must not. The gate's whole risk is answering "reusable"
// when it is not, so each case here is one way that could happen.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dslInputsHash, feInputsHash, filesUnder, reuseProblem, takeForward, typesInputsHash } from '../../src/build/phase-cache';
import { readDependencyBuild, PACK_LAYOUT } from '@apackdev/host/packs';
import { _declarationRevision } from '@apackdev/sdk/build';
import * as toolIdentity from '../../src/build/tool-identity.ts';

const dirs: string[] = [];

function tmp(files: Record<string, string> = {}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-phase-cache-'));
  dirs.push(dir);
  for (const [file, body] of Object.entries(files)) {
    fs.mkdirSync(path.join(dir, path.dirname(file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), body);
  }
  return dir;
}

function dependency(version: string) {
  const manifest = { id: 'dep', name: 'Dep', version };
  const dir = tmp({ [PACK_LAYOUT.snapshot]: JSON.stringify({ manifest, declarationRevision: _declarationRevision(manifest),
    types: { entities: {}, relKinds: {} }, facades: {} }) });
  return new Map([['dep', readDependencyBuild(dir)]]);
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

it('invalidates every cached phase when the shared tool implementation changes', () => {
  const root = tmp({ 'apack.json': '{"id":"p"}' });
  const tool = vi.spyOn(toolIdentity, 'buildToolHash').mockReturnValue('before');
  const phases = [() => feInputsHash(root, { release: false }, [], new Map()),
    () => typesInputsHash(root, new Map()), () => dslInputsHash(root, [], new Map())];
  const before = phases.map(hash => hash());
  tool.mockReturnValue('after');
  phases.forEach((hash, index) => expect(hash()).not.toBe(before[index]));
});

describe('reuseProblem', () => {
  const stamp = { hash: 'h', files: ['runtime/fe.js'] };

  it('reuses when the hash matches and the output is there', () => {
    expect(reuseProblem(stamp, tmp({ 'runtime/fe.js': 'x' }), 'h')).toBeNull();
  });

  it('refuses a pack it has no record of', () => {
    expect(reuseProblem(undefined, tmp(), 'h')).toBe('no record of the last build');
  });

  it('refuses when the inputs moved', () => {
    expect(reuseProblem(stamp, tmp({ 'runtime/fe.js': 'x' }), 'other')).toBe('inputs changed');
  });

  it('refuses when a recorded output is gone, which the hash alone cannot see', () => {
    expect(reuseProblem(stamp, tmp(), 'h')).toBe('missing runtime/fe.js');
  });

  it('refuses a record of nothing, so an empty output set is never "reusable"', () => {
    expect(reuseProblem({ hash: 'h', files: [] }, tmp(), 'h')).toBe('recorded no output');
  });
});

describe('takeForward', () => {
  it('puts the recorded output where the staged tree expects it', () => {
    const dist = tmp({ 'runtime/fe.js': 'bundle', 'runtime/chunks/a.js': 'chunk' });
    const staged = tmp();

    takeForward(dist, staged, ['runtime/fe.js', 'runtime/chunks/a.js']);

    expect(filesUnder(staged)).toEqual(['runtime/chunks/a.js', 'runtime/fe.js']);
    expect(fs.readFileSync(path.join(staged, 'runtime/chunks/a.js'), 'utf-8')).toBe('chunk');
  });
});

describe('feInputsHash', () => {
  const pack = () => tmp({ 'apack.json': '{"id":"p"}', 'src/a.ts': 'export const a = 1' });

  it('is the same for the same tree, so an untouched pack reuses', () => {
    const root = pack();
    expect(feInputsHash(root, { release: false }, [], new Map())).toBe(feInputsHash(root, { release: false }, [], new Map()));
  });

  it('hashes staged definitions and ignores the prior published copy when the build supplies a staged directory', () => {
    const root = pack();
    const definitionsDir = path.join(root, '.apack/build/defs');
    fs.mkdirSync(definitionsDir, { recursive: true });
    const current = path.join(definitionsDir, 'row.d.ts');
    fs.writeFileSync(current, 'before');
    const options = { release: false, definitionsDir };
    const before = feInputsHash(root, options, [], new Map());
    fs.mkdirSync(path.join(root, 'dist/defs'), { recursive: true });
    fs.writeFileSync(path.join(root, 'dist/defs/row.d.ts'), 'unrelated old output');
    expect(feInputsHash(root, options, [], new Map())).toBe(before);
    fs.writeFileSync(current, 'after');
    expect(feInputsHash(root, options, [], new Map())).not.toBe(before);
  });

  it('moves when a source changes', () => {
    const root = pack();
    const before = feInputsHash(root, { release: false }, [], new Map());
    fs.writeFileSync(path.join(root, 'src/a.ts'), 'export const a = 2');
    expect(feInputsHash(root, { release: false }, [], new Map())).not.toBe(before);
  });

  it.each(['assets/icon.svg', 'components/entry.vue', 'vite.config.mts', 'package-lock.json'])('invalidates for authored input %s outside the old source scope', file => {
    const root = pack();
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), 'before');
    const before = feInputsHash(root, { release: false }, [], new Map());
    fs.writeFileSync(path.join(root, file), 'after');
    expect(feInputsHash(root, { release: false }, [], new Map())).not.toBe(before);
  });

  it('ignores unrelated build output while including generated bundle entries', () => {
    const root = pack();
    const before = feInputsHash(root, { release: false }, [], new Map());
    fs.mkdirSync(path.join(root, '.apack'), { recursive: true });
    fs.writeFileSync(path.join(root, '.apack/cache.json'), '{}');
    fs.mkdirSync(path.join(root, 'dist/runtime'), { recursive: true });
    fs.writeFileSync(path.join(root, 'dist/runtime/index.cjs'), 'output');
    expect(feInputsHash(root, { release: false }, [], new Map())).toBe(before);
    fs.mkdirSync(path.join(root, 'src/__generated__'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/__generated__/pack-entry-fe.ts'), 'new entry');
    expect(feInputsHash(root, { release: false }, [], new Map())).not.toBe(before);
  });

  it('moves with --release, so a development bundle is never published as one', () => {
    const root = pack();
    expect(feInputsHash(root, { release: true }, [], new Map())).not.toBe(feInputsHash(root, { release: false }, [], new Map()));
  });

  it('moves when a package it compiles against changes, which is outside the pack', () => {
    const root = pack();
    const sdk = tmp({ 'index.js': 'v1' });
    const before = feInputsHash(root, { release: false }, [sdk], new Map());
    fs.writeFileSync(path.join(sdk, 'index.js'), 'v2');
    expect(feInputsHash(root, { release: false }, [sdk], new Map())).not.toBe(before);
  });

  it('ignores a touch, because the key is content and not a timestamp', () => {
    const root = pack();
    const before = feInputsHash(root, { release: false }, [], new Map());
    const later = new Date(Date.now() + 60_000);
    fs.utimesSync(path.join(root, 'src/a.ts'), later, later);
    expect(feInputsHash(root, { release: false }, [], new Map())).toBe(before);
  });
});

describe('the other two gated phases', () => {
  const pack = () => tmp({ 'apack.json': '{"id":"p"}', 'src/a.ts': 'export const a = 1' });

  it('the facade hash moves when a source changes', () => {
    const root = pack();
    const before = typesInputsHash(root, new Map());
    fs.writeFileSync(path.join(root, 'src/a.ts'), 'export const a = 2');
    expect(typesInputsHash(root, new Map())).not.toBe(before);
  });

  it("the facade hash moves when a dependency's snapshot does, which is what it compiles against", () => {
    const root = pack();
    expect(typesInputsHash(root, dependency('1.0.0')))
      .not.toBe(typesInputsHash(root, dependency('1.0.1')));
  });

  it('the DSL hash moves when the manifest changes, since its entries are what it reads', () => {
    const root = pack();
    const before = dslInputsHash(root, [], new Map());
    fs.writeFileSync(path.join(root, 'apack.json'), '{"id":"p","dsl":{}}');
    expect(dslInputsHash(root, [], new Map())).not.toBe(before);
  });

  it('gives each phase its own hash, so one going stale does not rebuild the others', () => {
    const root = pack();
    expect(new Set([feInputsHash(root, { release: false }, [], new Map()), typesInputsHash(root, new Map()), dslInputsHash(root, [], new Map())]).size).toBe(3);
  });
});
