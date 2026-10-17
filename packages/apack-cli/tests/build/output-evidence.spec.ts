import fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { freshnessSweep, stampedRun, stampedRunAll, unitStaleReason, type BuildUnit } from '@apackdev/host/build/packages-built';

let root: string;
let unit: BuildUnit;
let stamp: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-output-evidence-'));
  fs.writeFileSync(path.join(root, 'source.ts'), 'first source');
  fs.mkdirSync(path.join(root, 'dist'));
  unit = { inputs: [path.join(root, 'source.ts')], outputs: [path.join(root, 'dist')] };
  stamp = path.join(root, 'success.json');
});
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });
const output = () => path.join(root, 'dist', 'entry.js');
async function build() {
  await stampedRun('fixture', unit, stamp, () => { fs.copyFileSync(path.join(root, 'source.ts'), output()); });
  expect(unitStaleReason(unit, stamp)).toBeNull();
}

describe('successful output evidence', () => {
  it.each(['changed', 'missing', 'extra'])('refuses %s output despite identical input bytes', async mode => {
    await build();
    if (mode === 'changed') fs.writeFileSync(output(), 'other output');
    else if (mode === 'missing') fs.rmSync(output());
    else fs.writeFileSync(path.join(root, 'dist', 'extra.js'), 'extra');
    expect(unitStaleReason(unit, stamp)).toContain('outputs changed');
  });

  it('detects an out-of-band build after its source edit is restored', async () => {
    await build();
    fs.writeFileSync(path.join(root, 'source.ts'), 'temporary source');
    fs.copyFileSync(path.join(root, 'source.ts'), output());
    fs.writeFileSync(path.join(root, 'source.ts'), 'first source');
    expect(unitStaleReason(unit, stamp)).toContain('outputs changed');
  });

  it('includes hidden files, shipped prose and nested modules in produced output evidence', async () => {
    fs.mkdirSync(path.join(root, 'dist', 'node_modules', 'peer'), { recursive: true });
    fs.writeFileSync(path.join(root, 'dist', '.metadata'), 'metadata');
    fs.writeFileSync(path.join(root, 'dist', 'README.md'), 'shipped prose');
    fs.writeFileSync(path.join(root, 'dist', 'node_modules', 'peer', 'index.js'), 'peer');
    await build();
    for (const file of ['.metadata', 'README.md', 'node_modules/peer/index.js']) {
      const full = path.join(root, 'dist', file);
      const saved = fs.readFileSync(full);
      fs.writeFileSync(full, 'changed');
      expect(unitStaleReason(unit, stamp), file).toContain('outputs changed');
      fs.writeFileSync(full, saved);
      expect(unitStaleReason(unit, stamp), file).toBeNull();
    }
  });

  it('rejects a partial atomic replacement through the retained prior success record', async () => {
    const second = path.join(root, 'second-output');
    fs.mkdirSync(second);
    fs.writeFileSync(path.join(second, 'entry.js'), 'first source');
    unit = { ...unit, outputs: [...unit.outputs, second] };
    await build();
    await stampedRun('fixture', unit, stamp, () => {
      fs.writeFileSync(output(), 'replacement');
      expect(fs.existsSync(stamp)).toBe(true);
      expect(unitStaleReason(unit, stamp)).toContain('outputs changed');
      fs.writeFileSync(path.join(second, 'entry.js'), 'replacement');
    }, { atomic: true });
    expect(unitStaleReason(unit, stamp)).toBeNull();
  });

  it('forgets output listings and bytes after a declared writer runs', async () => {
    await build();
    const sweep = freshnessSweep();
    expect(sweep.staleReason(unit, stamp)).toBeNull();
    fs.writeFileSync(path.join(root, 'dist', 'added.js'), 'added');
    expect(sweep.staleReason(unit, stamp)).toBeNull();
    sweep.forget(unit.outputs);
    expect(sweep.staleReason(unit, stamp)).toContain('outputs changed');
  });

  it('drops every retained success record when post-run output capture fails', async () => {
    await build();
    const secondStamp = path.join(root, 'other-success.json');
    fs.copyFileSync(stamp, secondStamp);
    await expect(stampedRunAll([
      { label: 'first', unit, stamp }, { label: 'second', unit, stamp: secondStamp },
    ], () => { fs.rmSync(path.join(root, 'dist'), { recursive: true }); }, { atomic: true })).rejects.toThrow();
    expect(fs.existsSync(stamp)).toBe(false);
    expect(fs.existsSync(secondStamp)).toBe(false);
  });
});
