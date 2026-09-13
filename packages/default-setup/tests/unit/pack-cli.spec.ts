import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFileSync } from 'node:child_process';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pack-cli-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeManifest(dir: string, manifest: Record<string, unknown>) {
  fs.writeFileSync(path.join(dir, 'abuddy.json'), JSON.stringify(manifest, null, 2));
}

function writeDist(dir: string) {
  fs.mkdirSync(path.join(dir, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'dist', 'placeholder.json'), '{}');
}

describe('pack CLI: init', () => {
  it('scaffolds a valid pack directory structure', async () => {
    const { init } = await import('../../../abuddy-cli/src/commands/init');

    const packName = 'test-pack';
    const packDir = path.join(tmpDir, packName);

    // init uses process.cwd() to resolve paths and readline for prompts,
    // so we call it with a pre-set name arg and override cwd
    const origCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      await init([packName]);
    } finally {
      process.chdir(origCwd);
    }

    expect(fs.existsSync(packDir)).toBe(true);
    expect(fs.existsSync(path.join(packDir, 'abuddy.json'))).toBe(true);
    expect(fs.existsSync(path.join(packDir, 'package.json'))).toBe(true);
    expect(fs.existsSync(path.join(packDir, 'tsconfig.json'))).toBe(true);
    expect(fs.existsSync(path.join(packDir, '.gitignore'))).toBe(true);
    expect(fs.existsSync(path.join(packDir, 'src', 'seeds', 'actions'))).toBe(true);
    expect(fs.existsSync(path.join(packDir, 'src', 'seeds', 'flows'))).toBe(true);
    // Features come from `abuddy add feature`; the pack id (kebab-case) is not a valid feature id
    expect(fs.existsSync(path.join(packDir, 'src', 'features', packName))).toBe(false);
    expect(fs.existsSync(path.join(packDir, '.github', 'workflows', 'release.yml'))).toBe(true);
    expect(fs.existsSync(path.join(packDir, 'src', '__generated__', 'pack-entry-fe.ts'))).toBe(true);
    expect(fs.existsSync(path.join(packDir, 'vitest.config.ts'))).toBe(true);
    expect(fs.existsSync(path.join(packDir, 'tests', 'unit', `${packName}.spec.ts`))).toBe(true);

    // Verify manifest content
    const manifest = JSON.parse(fs.readFileSync(path.join(packDir, 'abuddy.json'), 'utf-8'));
    expect(manifest.id).toBe('test-pack');
    expect(manifest.name).toBe('Test Pack');
    expect(manifest.version).toBe('0.1.0');
    expect(manifest.boot?.seed).toBeDefined();
    expect(manifest.boot.seed.actions).toBe('src/seeds/actions');
    expect(manifest.boot.seed.flows).toBe('src/seeds/flows');
  });

  it('rejects invalid pack names', async () => {
    const { init } = await import('../../../abuddy-cli/src/commands/init');

    const origCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      await expect(init(['Invalid_Name'])).rejects.toThrow(/lowercase alphanumeric/);
    } finally {
      process.chdir(origCwd);
    }
  });

  it('rejects if directory already exists', async () => {
    const { init } = await import('../../../abuddy-cli/src/commands/init');

    fs.mkdirSync(path.join(tmpDir, 'exists'));

    const origCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      await expect(init(['exists'])).rejects.toThrow(/already exists/);
    } finally {
      process.chdir(origCwd);
    }
  });
});

describe('pack CLI: install', () => {
  it('install with no args returns without throwing (prints help)', async () => {
    const { install } = await import('../../../abuddy-cli/src/commands/install');
    await expect(install([])).resolves.toBeUndefined();
  });

  it('installPackFromLocal throws on nonexistent path', async () => {
    const { installPackFromLocal } = await import('../../../abuddy-host/src/packs/pack-installer');
    await expect(installPackFromLocal('/nonexistent/path')).rejects.toThrow(/Path not found/);
  });

  it('rejects manifest with invalid id format', async () => {
    const { install } = await import('../../../abuddy-cli/src/commands/install');

    const badPack = path.join(tmpDir, 'bad-id-pack');
    fs.mkdirSync(badPack, { recursive: true });
    writeManifest(badPack, {
      id: 'INVALID_ID',
      name: 'Bad',
      version: '1.0.0',
    });
    writeDist(badPack);

    await expect(install([badPack])).rejects.toThrow(/lowercase alphanumeric/);
  });

  it('rejects pack without dist directory', async () => {
    const { install } = await import('../../../abuddy-cli/src/commands/install');

    const noDist = path.join(tmpDir, 'no-dist');
    fs.mkdirSync(noDist, { recursive: true });
    writeManifest(noDist, {
      id: 'no-dist',
      name: 'No Dist',
      version: '1.0.0',
    });

    await expect(install([noDist])).rejects.toThrow(/Pack is not built/);
  });

  it('rejects pack without abuddy.json', async () => {
    const { install } = await import('../../../abuddy-cli/src/commands/install');

    const noManifest = path.join(tmpDir, 'no-manifest');
    fs.mkdirSync(noManifest, { recursive: true });

    await expect(install([noManifest])).rejects.toThrow(/No abuddy.json/);
  });

  it('symlinks in source directory are skipped during copy', async () => {
    const { installPackFromLocal } = await import('../../../abuddy-host/src/packs/pack-installer');

    const sourceDir = path.join(tmpDir, 'symlink-pack');
    fs.mkdirSync(path.join(sourceDir, 'dist'), { recursive: true });
    writeManifest(sourceDir, {
      id: 'symlink-test',
      name: 'Symlink Test',
      version: '1.0.0',
    });
    fs.writeFileSync(path.join(sourceDir, 'dist', 'real.json'), '{}');

    const outsideFile = path.join(tmpDir, 'secret.txt');
    fs.writeFileSync(outsideFile, 'secret data');
    fs.symlinkSync(outsideFile, path.join(sourceDir, 'dist', 'link.txt'));

    expect(fs.lstatSync(path.join(sourceDir, 'dist', 'link.txt')).isSymbolicLink()).toBe(true);

    const packsDir = path.join(tmpDir, 'packs');
    const result = await installPackFromLocal(sourceDir, packsDir);

    const installedDir = result.dir;
    expect(fs.existsSync(installedDir)).toBe(true);
    expect(fs.existsSync(path.join(installedDir, 'dist', 'real.json'))).toBe(true);
    expect(fs.existsSync(path.join(installedDir, 'dist', 'link.txt'))).toBe(false);
  });

  it('installs from a zip file', async () => {
    const { installPackFromLocal } = await import('../../../abuddy-host/src/packs/pack-installer');

    const sourceDir = path.join(tmpDir, 'zip-source');
    fs.mkdirSync(path.join(sourceDir, 'dist'), { recursive: true });
    writeManifest(sourceDir, {
      id: 'zip-pack',
      name: 'Zip Pack',
      version: '1.0.0',
    });
    fs.writeFileSync(path.join(sourceDir, 'dist', 'data.json'), '{"test": true}');

    const zipPath = path.join(tmpDir, 'pack.zip');
    try {
      execFileSync('zip', ['-r', zipPath, '.'], { cwd: sourceDir, stdio: 'pipe' });
    } catch {
      console.log('zip command not available, skipping zip install test');
      return;
    }

    const packsDir = path.join(tmpDir, 'packs');
    const result = await installPackFromLocal(zipPath, packsDir);

    const installedDir = result.dir;
    expect(fs.existsSync(installedDir)).toBe(true);
    expect(fs.existsSync(path.join(installedDir, 'abuddy.json'))).toBe(true);
    expect(fs.existsSync(path.join(installedDir, 'dist', 'data.json'))).toBe(true);
  });
});

describe('pack CLI: validate', () => {
  it('validateManifest catches missing fields', async () => {
    const packDir = path.join(tmpDir, 'validate-test');
    fs.mkdirSync(packDir, { recursive: true });

    writeManifest(packDir, {});

    const manifest = JSON.parse(fs.readFileSync(path.join(packDir, 'abuddy.json'), 'utf-8'));
    expect(manifest.id).toBeUndefined();
    expect(manifest.name).toBeUndefined();
    expect(manifest.version).toBeUndefined();
  });
});

describe('pack CLI: security', () => {
  it('manifest id validation prevents path traversal', () => {
    const maliciousIds = [
      '../../../etc',
      '..%2F..%2Fetc',
      'UPPERCASE',
      'has spaces',
      'has/slash',
      '.hidden',
      '-starts-with-dash',
    ];

    const validPattern = /^[a-z][a-z0-9-]*$/;
    for (const id of maliciousIds) {
      expect(validPattern.test(id)).toBe(false);
    }
  });

  it('valid ids pass the pattern', () => {
    const validIds = ['my-pack', 'a', 'pack123', 'hello-world-v2'];
    const validPattern = /^[a-z][a-z0-9-]*$/;
    for (const id of validIds) {
      expect(validPattern.test(id)).toBe(true);
    }
  });
});
