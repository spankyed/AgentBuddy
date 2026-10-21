// `apack pack init` in-process: the scaffold it writes, including the generated entries. Codegen is real work, a
// few seconds on a fast machine and several times that on a loaded small runner, so it runs in this half with its
// 60s budget rather than in the per-change loop's 15s.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let tmpDir: string;
let previousEnvironment: { channel?: string; userDataDir?: string; hostRoot?: string; hostExecutable?: string };

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pack-init-test-'));
  previousEnvironment = { channel: process.env.APACK_CLI_CHANNEL, userDataDir: process.env.APACK_USER_DATA_DIR, hostRoot: process.env.APACK_HOST_ROOT, hostExecutable: process.env.APACK_HOST_EXECUTABLE };
  process.env.APACK_CLI_CHANNEL = 'test';
  process.env.APACK_USER_DATA_DIR = path.join(tmpDir, 'app-data');
  process.env.APACK_HOST_ROOT = path.join(tmpDir, 'host');
  delete process.env.APACK_HOST_EXECUTABLE;
  fs.mkdirSync(path.join(tmpDir, 'host', 'packages'), { recursive: true });
});

afterEach(() => {
  for (const [key, value] of [['APACK_CLI_CHANNEL', previousEnvironment.channel], ['APACK_USER_DATA_DIR', previousEnvironment.userDataDir], ['APACK_HOST_ROOT', previousEnvironment.hostRoot], ['APACK_HOST_EXECUTABLE', previousEnvironment.hostExecutable]] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('pack CLI: init', () => {
  it('scaffolds a valid pack directory structure', async () => {
    const { init } = await import('../../src/commands/init');

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
    expect(fs.existsSync(path.join(packDir, 'apack.json'))).toBe(true);
    expect(fs.existsSync(path.join(packDir, 'package.json'))).toBe(true);
    expect(fs.existsSync(path.join(packDir, 'tsconfig.json'))).toBe(true);
    expect(fs.existsSync(path.join(packDir, '.gitignore'))).toBe(true);
    expect(fs.existsSync(path.join(packDir, 'src', 'content', 'actions'))).toBe(true);
    expect(fs.existsSync(path.join(packDir, 'src', 'content', 'flows'))).toBe(true);
    // Features come from `apack pack add feature`; the pack id (kebab-case) is not a valid feature id
    expect(fs.existsSync(path.join(packDir, '.github', 'workflows', 'release.yml'))).toBe(true);
    expect(fs.existsSync(path.join(packDir, 'src', '__generated__', 'pack-entry-fe.ts'))).toBe(true);
    expect(fs.existsSync(path.join(packDir, 'vitest.config.ts'))).toBe(true);
    expect(fs.existsSync(path.join(packDir, 'tests', `${packName}.spec.ts`))).toBe(true);

    // Verify manifest content
    const manifest = JSON.parse(fs.readFileSync(path.join(packDir, 'apack.json'), 'utf-8'));
    expect(manifest.id).toBe('test-pack');
    expect(manifest.name).toBe('Test Pack');
    expect(manifest.version).toBe('0.1.0');
    expect(manifest.content?.sources).toBeDefined();
    expect(manifest.content.sources.actions).toBe('src/content/actions');
    expect(manifest.content.sources.flows).toBe('src/content/flows');
  });
});
