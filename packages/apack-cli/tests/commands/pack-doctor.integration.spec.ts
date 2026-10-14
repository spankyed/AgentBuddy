import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CLI, run } from '../_support/pack-builds';

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });

function fixture(extra: object = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-pack-doctor-'));
  dirs.push(dir);
  fs.mkdirSync(path.join(dir, 'src'));
  fs.writeFileSync(path.join(dir, 'apack.json'), JSON.stringify({
    id: 'doctor-fixture', name: 'Doctor fixture', version: '1.0.0',
    lifecycle: { onInit: 'src/hooks#onInit' }, ...extra,
  }));
  fs.writeFileSync(path.join(dir, 'src/hooks.ts'), 'throw new Error("Must not execute"); export function onInit() {}');
  return dir;
}

describe('pack doctor static validation', () => {
  it('checks extensionless exports without executing modules or generating files', () => {
    const dir = fixture();
    const result = run(process.execPath, [CLI, 'pack', 'doctor'], dir);
    expect(result.code, result.output).toBe(0);
    expect(result.output).toContain('Pack health valid.');
    expect(result.output).toContain('Generated files are absent');
    expect(fs.existsSync(path.join(dir, 'src/__generated__'))).toBe(false);
  });

  it('refuses a missing export naming its declaration', () => {
    const dir = fixture({ lifecycle: { onInit: 'src/hooks#missing' } });
    const result = run(process.execPath, [CLI, 'pack', 'doctor'], dir);
    expect(result.code).toBe(1);
    expect(result.output).toContain('onInit');
    expect(result.output).toContain('missing');
    expect(result.output).toContain('Pack health invalid.');
  });

  it('reports unresolved dependencies and unchecked exports as incomplete', () => {
    const dir = fixture({ dependencies: { unavailable: 'file:./missing-dependency' } });
    const result = run(process.execPath, [CLI, 'pack', 'doctor'], dir);
    expect(result.code, result.output).toBe(2);
    expect(result.output).toContain('codegen not checked');
    expect(result.output).toContain('Pack health incomplete.');
    expect(result.output).not.toContain('Pack health valid.');
    expect(fs.existsSync(path.join(dir, '.apack'))).toBe(false);
  });
});
