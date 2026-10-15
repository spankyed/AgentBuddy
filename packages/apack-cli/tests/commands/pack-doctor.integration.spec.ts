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
  it.each([
    [{ version: '1.2.3garbage' }, 'version'],
    [{ hostVersion: '' }, 'hostVersion'],
    [{ dependencies: { provider: 'github:owner/repo nonsense' } }, 'dependencies.provider'],
  ])('reports malformed release/dependency metadata at its manifest path: %s', (extra, field) => {
    const dir = fixture(extra);
    const result = run(process.execPath, [CLI, 'pack', 'doctor'], dir);
    expect(result.code, result.output).toBe(1);
    expect(result.output).toContain(field);
    const json = run(process.execPath, [CLI, 'pack', 'validate', '--json'], dir);
    expect(json.code, json.output).toBe(1);
    const report = JSON.parse(json.output);
    expect(report.status).toBe('invalid');
    expect(report.diagnostics.some((issue: { path: string[] }) => issue.path.join('.') === field)).toBe(true);
    expect(result.output).not.toContain('Must not execute');
    expect(fs.existsSync(path.join(dir, '.apack'))).toBe(false);
  });

  it.each(['doctor', 'validate'])('pack %s enforces inline check policy without executing source', (command) => {
    const dir = fixture();
    fs.mkdirSync(path.join(dir, 'src/extensions'));
    fs.writeFileSync(path.join(dir, 'src/extensions/log.ts'), 'throw new Error("Must not execute"); console.log("sample");');
    const invoke = () => run(process.execPath, [CLI, 'pack', command], dir);
    const failure = invoke();
    expect(failure.code, failure.output).toBe(1);
    expect(failure.output).toContain('backend-console');
    const file = path.join(dir, 'apack.json');
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    fs.writeFileSync(file, JSON.stringify({ ...manifest, checks: { allow: ['backend-console'] } }));
    const allowed = invoke();
    expect(allowed.code, allowed.output).toBe(0);
    fs.writeFileSync(file, JSON.stringify({ ...manifest, checks: { allow: ['host-imports'] } }));
    const refused = invoke();
    expect(refused.code, refused.output).toBe(1);
    expect(refused.output).toContain('checks.allow.0');
    expect(fs.existsSync(path.join(dir, 'src/__generated__'))).toBe(false);
  });

  it.each(['doctor', 'validate'])('pack %s checks a system module default export without activation', (command) => {
    const dir = fixture({ features: { memos: { description: 'Manage memos.', system: { entry: 'src/hooks' } } } });
    const result = run(process.execPath, [CLI, 'pack', command], dir);
    expect(result.code, result.output).toBe(1);
    expect(result.output).toContain('system.entry');
    expect(result.output).toContain('export "default" as a value');
    expect(result.output).not.toContain('Must not execute');
    expect(fs.existsSync(path.join(dir, 'src/__generated__'))).toBe(false);
  });

  it.each(['doctor', 'validate'])('pack %s diagnoses an export selector where a whole module is required', (command) => {
    const dir = fixture({ dependencies: { unavailable: 'file:./missing-dependency' },
      features: { memos: { description: 'Manage memos.', system: { entry: 'src/hooks#onInit' } } },
    });
    const result = run(process.execPath, [CLI, 'pack', command], dir);
    expect(result.code, result.output).toBe(1);
    expect(result.output).toContain('features.memos.system.entry');
    expect(result.output).toContain('without an export selector');
    expect(result.output).not.toContain('Must not execute');
    expect(fs.existsSync(path.join(dir, 'src/__generated__'))).toBe(false);
    expect(fs.existsSync(path.join(dir, '.apack'))).toBe(false);
  });

  it.each(['doctor', 'validate'])('pack %s reports missing declared files even with unresolved dependencies', (command) => {
    const dir = fixture({ dependencies: { unavailable: 'file:./missing-dependency' },
      extensions: { steps: { example: { node: { label: 'Example' }, build: { compile: 'src/missing#compile', validate: 'src/missing#validate', getLabel: 'src/missing#getLabel' } } } },
      migrations: { pack: { '1.0.0': { description: 'Initialize', up: 'src/missing#up' } } },
    });
    const result = run(process.execPath, [CLI, 'pack', command], dir);
    expect(result.code, result.output).toBe(1);
    expect(result.output).toContain('extensions.steps.example.build');
    expect(result.output).toContain('migrations.pack.1.0.0.up');
    expect(result.output).toContain('src/missing');
    expect(fs.existsSync(path.join(dir, 'src/__generated__'))).toBe(false);
    expect(fs.existsSync(path.join(dir, '.apack'))).toBe(false);
  });

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
