// What makes a phase's output reusable, and what must not. The gate's whole risk is answering "reusable"
// when it is not, so each case here is one way that could happen.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { feInputsHash, filesUnder, reuseProblem, takeForward } from '../../src/build/phase-cache';

const dirs: string[] = [];

function tmp(files: Record<string, string> = {}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-phase-cache-'));
  dirs.push(dir);
  for (const [file, body] of Object.entries(files)) {
    fs.mkdirSync(path.join(dir, path.dirname(file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), body);
  }
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
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
  const pack = () => tmp({ 'abuddy.json': '{"id":"p"}', 'src/a.ts': 'export const a = 1' });

  it('is the same for the same tree, so an untouched pack reuses', () => {
    const root = pack();
    expect(feInputsHash(root, { release: false }, [])).toBe(feInputsHash(root, { release: false }, []));
  });

  it('moves when a source changes', () => {
    const root = pack();
    const before = feInputsHash(root, { release: false }, []);
    fs.writeFileSync(path.join(root, 'src/a.ts'), 'export const a = 2');
    expect(feInputsHash(root, { release: false }, [])).not.toBe(before);
  });

  it('moves with --release, so a development bundle is never published as one', () => {
    const root = pack();
    expect(feInputsHash(root, { release: true }, [])).not.toBe(feInputsHash(root, { release: false }, []));
  });

  it('moves when a package it compiles against changes, which is outside the pack', () => {
    const root = pack();
    const sdk = tmp({ 'index.js': 'v1' });
    const before = feInputsHash(root, { release: false }, [sdk]);
    fs.writeFileSync(path.join(sdk, 'index.js'), 'v2');
    expect(feInputsHash(root, { release: false }, [sdk])).not.toBe(before);
  });

  it('ignores a touch, because the key is content and not a timestamp', () => {
    const root = pack();
    const before = feInputsHash(root, { release: false }, []);
    const later = new Date(Date.now() + 60_000);
    fs.utimesSync(path.join(root, 'src/a.ts'), later, later);
    expect(feInputsHash(root, { release: false }, [])).toBe(before);
  });
});
