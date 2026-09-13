import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkDependencies } from '../../src/packs/pack-installer.ts';

let userData: string;
let packsDir: string;
const savedBuiltInDir = process.env.BUILT_IN_PACKS_DIR;

beforeEach(() => {
  userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pack-deps-'));
  packsDir = path.join(userData, 'packs');
  fs.mkdirSync(packsDir);
  delete process.env.BUILT_IN_PACKS_DIR;
});

afterEach(() => {
  if (savedBuiltInDir === undefined) delete process.env.BUILT_IN_PACKS_DIR;
  else process.env.BUILT_IN_PACKS_DIR = savedBuiltInDir;
  fs.rmSync(userData, { recursive: true, force: true });
});

const manifest = { dependencies: { 'default-setup': '*', 'other-pack': '^1.0.0' } };

describe('checkDependencies', () => {
  it('treats built-in packs the app published into the data dir as present', () => {
    fs.mkdirSync(path.join(userData, 'host-packs', 'default-setup', 'types'), { recursive: true });

    expect(checkDependencies(manifest, packsDir)).toEqual(['other-pack']);
  });

  it('publishes built-in packs through a hidden staging dir, which never counts as a pack', async () => {
    const { publishHostPackArtifacts } = await import('../../src/packs/bundle.ts');
    const source = path.join(userData, 'app', 'default-setup');
    fs.mkdirSync(path.join(source, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(source, 'dist', 'snapshot.json'), '{}');
    // An earlier publish that crashed between staging and rename
    fs.mkdirSync(path.join(userData, 'host-packs', '.default-setup.publishing-1'), { recursive: true });

    publishHostPackArtifacts(source, path.join(userData, 'host-packs', 'default-setup'));

    expect(fs.readdirSync(path.join(userData, 'host-packs')).filter(name => !name.startsWith('.'))).toEqual(['default-setup']);
    expect(checkDependencies({ dependencies: { '.default-setup.publishing-1': '*' } }, packsDir)).toEqual(['.default-setup.publishing-1']);
  });

  it('treats installed packs as present', () => {
    fs.mkdirSync(path.join(packsDir, 'other-pack'));
    fs.writeFileSync(path.join(packsDir, 'other-pack', 'abuddy.json'), '{}');

    expect(checkDependencies(manifest, packsDir)).toEqual(['default-setup']);
  });

  it('uses BUILT_IN_PACKS_DIR inside the app', () => {
    const packages = path.join(userData, 'app-packages');
    fs.mkdirSync(path.join(packages, 'default-setup'), { recursive: true });
    fs.writeFileSync(path.join(packages, 'default-setup', 'abuddy.json'), JSON.stringify({ id: 'default-setup', name: 'Default Setup', builtIn: true }));
    process.env.BUILT_IN_PACKS_DIR = packages;

    expect(checkDependencies(manifest, packsDir)).toEqual(['other-pack']);
  });

  it('reports every dependency when nothing provides them', () => {
    expect(checkDependencies(manifest, packsDir)).toEqual(['default-setup', 'other-pack']);
  });
});
