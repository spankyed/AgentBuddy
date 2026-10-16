// What makes a phase's output reusable, and what must not. The gate's whole risk is answering "reusable"
// when it is not, so each case here is one way that could happen.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dslInputsHash, filesUnder, reuseProblem, takeForward, typesInputsHash } from '../../src/build/phase-cache';
import { readDependencyBuild, PACK_LAYOUT } from '@apackdev/host/packs';
import { _declarationRevision } from '@apackdev/sdk/build';

const compilation = { hash: 'test-compiler', configuration: undefined, readFile() { return undefined; }, captureGenerated() {}, assertCurrent() {} };


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

it('invalidates every cached phase when captured compiler inputs change', () => {
  const root = tmp({ 'apack.json': '{"id":"p"}' });
  const phases = [scope => typesInputsHash(root, new Map(), scope), scope => dslInputsHash(root, [], new Map(), scope)] satisfies Array<(scope: typeof compilation) => string>;
  for (const hash of phases) expect(hash({ ...compilation, hash: 'after' })).not.toBe(hash(compilation));
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

describe('cached input scopes', () => {
  const pack = () => tmp({ 'apack.json': '{"id":"p"}', 'src/a.ts': 'export const a = 1' });

  it('is the same for the same tree, so an untouched pack reuses', () => {
    const root = pack();
    expect(dslInputsHash(root, [], new Map(), compilation)).toBe(dslInputsHash(root, [], new Map(), compilation));
  });



  it('moves when a source changes', () => {
    const root = pack();
    const before = dslInputsHash(root, [], new Map(), compilation);
    fs.writeFileSync(path.join(root, 'src/a.ts'), 'export const a = 2');
    expect(dslInputsHash(root, [], new Map(), compilation)).not.toBe(before);
  });

  it.each(['assets/icon.svg', 'components/entry.vue', 'vite.config.mts', 'package-lock.json'])('invalidates for authored input %s outside the old source scope', file => {
    const root = pack();
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), 'before');
    const before = dslInputsHash(root, [], new Map(), compilation);
    fs.writeFileSync(path.join(root, file), 'after');
    expect(dslInputsHash(root, [], new Map(), compilation)).not.toBe(before);
  });

  it('ignores unrelated build output while including generated bundle entries', () => {
    const root = pack();
    const before = dslInputsHash(root, [], new Map(), compilation);
    fs.mkdirSync(path.join(root, '.apack'), { recursive: true });
    fs.writeFileSync(path.join(root, '.apack/cache.json'), '{}');
    fs.mkdirSync(path.join(root, 'dist/runtime'), { recursive: true });
    fs.writeFileSync(path.join(root, 'dist/runtime/index.cjs'), 'output');
    expect(dslInputsHash(root, [], new Map(), compilation)).toBe(before);
    fs.mkdirSync(path.join(root, 'src/__generated__'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/__generated__/pack-entry-fe.ts'), 'new entry');
    expect(dslInputsHash(root, [], new Map(), compilation)).not.toBe(before);
  });



  it('moves when a package it compiles against changes, which is outside the pack', () => {
    const root = pack();
    const sdk = tmp({ 'index.js': 'v1' });
    const before = dslInputsHash(root, [sdk], new Map(), compilation);
    fs.writeFileSync(path.join(sdk, 'index.js'), 'v2');
    expect(dslInputsHash(root, [sdk], new Map(), compilation)).not.toBe(before);
  });

  it('ignores a touch, because the key is content and not a timestamp', () => {
    const root = pack();
    const before = dslInputsHash(root, [], new Map(), compilation);
    const later = new Date(Date.now() + 60_000);
    fs.utimesSync(path.join(root, 'src/a.ts'), later, later);
    expect(dslInputsHash(root, [], new Map(), compilation)).toBe(before);
  });
});

describe('phase identities and dependencies', () => {
  const pack = () => tmp({ 'apack.json': '{"id":"p"}', 'src/a.ts': 'export const a = 1' });

  it('the facade hash moves when a source changes', () => {
    const root = pack();
    const before = typesInputsHash(root, new Map(), compilation);
    fs.writeFileSync(path.join(root, 'src/a.ts'), 'export const a = 2');
    expect(typesInputsHash(root, new Map(), compilation)).not.toBe(before);
  });

  it("the facade hash moves when a dependency's snapshot does, which is what it compiles against", () => {
    const root = pack();
    expect(typesInputsHash(root, dependency('1.0.0'), compilation))
      .not.toBe(typesInputsHash(root, dependency('1.0.1'), compilation));
  });

  it('the DSL hash moves when the manifest changes, since its entries are what it reads', () => {
    const root = pack();
    const before = dslInputsHash(root, [], new Map(), compilation);
    fs.writeFileSync(path.join(root, 'apack.json'), '{"id":"p","dsl":{}}');
    expect(dslInputsHash(root, [], new Map(), compilation)).not.toBe(before);
  });

  it('gives each cached phase a distinct hash', () => {
    const root = pack();
    expect(new Set([typesInputsHash(root, new Map(), compilation), dslInputsHash(root, [], new Map(), compilation)]).size).toBe(2);
  });
});
