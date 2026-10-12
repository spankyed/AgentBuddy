import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { packInputsHash } from '../../src/build/pack-inputs.ts';

const roots: string[] = [];
function pack(file: string, content: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-inputs-'));
  roots.push(root);
  fs.writeFileSync(path.join(root, file), content);
  return root;
}
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

describe('pack input identity', () => {
  it('is independent of checkout location and distinguishes ambiguous filename/content concatenation', () => {
    const first = pack('a', 'bc');
    expect(packInputsHash(first)).toBe(packInputsHash(pack('a', 'bc')));
    expect(packInputsHash(first)).not.toBe(packInputsHash(pack('ab', 'c')));
  });

  it('retains authored nested dist folders while excluding root build/dependency trees', () => {
    const root = pack('entry.ts', 'source');
    const before = packInputsHash(root);
    for (const dir of ['.git', 'node_modules', 'dist', '.apack', 'src/__generated__']) {
      fs.mkdirSync(path.join(root, dir), { recursive: true });
      fs.writeFileSync(path.join(root, dir, 'entry.ts'), 'output');
    }
    expect(packInputsHash(root)).toBe(before);
    fs.mkdirSync(path.join(root, 'src/dist'));
    fs.writeFileSync(path.join(root, 'src/dist/entry.ts'), 'authored');
    expect(packInputsHash(root)).not.toBe(before);
  });

  it('tracks source symlinks and refuses directory cycles', () => {
    const root = pack('entry.ts', 'source');
    const linked = pack('schema.json', '{}');
    fs.symlinkSync(linked, path.join(root, 'schemas'), 'dir');
    const before = packInputsHash(root);
    fs.writeFileSync(path.join(linked, 'schema.json'), '{"type":"object"}');
    expect(packInputsHash(root)).not.toBe(before);
    fs.symlinkSync(root, path.join(root, 'loop'), 'dir');
    expect(() => packInputsHash(root)).toThrow('Cyclic source directory');
  });
});
