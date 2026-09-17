import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bundlePackFE } from '../../src/build/fe-bundler';

// Computed here rather than taken from tests/helpers/published-packages, whose import checks that
// the published packages' dist is up to date — irrelevant to this suite, which builds from source.
const REPO_ROOT = path.resolve(import.meta.dirname, '../../../..');

/**
 * A pack whose Tailwind setup doesn't work must never build quietly: the bundle would load with
 * every component unstyled and nothing to read anywhere. See `tailwindPostcssPlugins`.
 */

const tmpDirs: string[] = [];
afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

interface PackFiles {
  manifest?: Record<string, unknown> | string;
  tailwindConfig?: string;
  entry?: string;
  /** Link the repo's node_modules, so @abuddy/ui and vue resolve (default: yes) */
  linkNodeModules?: boolean;
}

function makePack({ manifest = {}, tailwindConfig, entry, linkNodeModules = true }: PackFiles): string {
  const packDir = fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-tw-'));
  tmpDirs.push(packDir);
  fs.writeFileSync(path.join(packDir, 'package.json'), JSON.stringify({ name: 'tw-pack', type: 'module' }));
  fs.writeFileSync(
    path.join(packDir, 'abuddy.json'),
    typeof manifest === 'string'
      ? manifest
      : JSON.stringify({ id: 'tw-pack', name: 'TW Pack', version: '1.0.0', ...manifest }),
  );
  if (linkNodeModules) fs.symlinkSync(path.join(REPO_ROOT, 'node_modules'), path.join(packDir, 'node_modules'), 'dir');
  if (tailwindConfig !== undefined) fs.writeFileSync(path.join(packDir, 'tailwind.config.ts'), tailwindConfig);
  fs.mkdirSync(path.join(packDir, 'src'));
  fs.writeFileSync(path.join(packDir, 'src', 'entry.ts'), entry ?? "export const cls = 'text-[#abc123]';\n");
  return packDir;
}

function build(packDir: string) {
  return bundlePackFE({ packDir, outputDir: path.join(packDir, 'dist'), entryPoint: path.join(packDir, 'src', 'entry.ts') });
}

function emittedCss(packDir: string): string {
  const dist = path.join(packDir, 'dist');
  return fs.readdirSync(dist)
    .filter((f) => f.endsWith('.css'))
    .map((f) => fs.readFileSync(path.join(dist, f), 'utf-8'))
    .join('\n');
}

describe('pack FE Tailwind setup', () => {
  it('generates the classes a pack uses', async () => {
    const packDir = makePack({});
    const result = await build(packDir);
    expect(result).toEqual({ success: true });
    expect(emittedCss(packDir)).toContain('#abc123');
  }, 60_000);

  it('fails the build when a pack that bundles @abuddy/ui has a tailwind.config that throws', async () => {
    const packDir = makePack({
      manifest: { fe: { bundleUi: true } },
      tailwindConfig: "throw new Error('bad tailwind config');\n",
    });
    const result = await build(packDir);
    expect(result.success).toBe(false);
    expect(result.error).toContain('tailwind.config.ts');
    expect(result.error).toContain('bad tailwind config');
  }, 60_000);

  it("fails the build when a bundleUi pack's tailwind.config has no usable content", async () => {
    const packDir = makePack({
      manifest: { fe: { bundleUi: true } },
      tailwindConfig: 'export default { theme: {} };\n',
    });
    const result = await build(packDir);
    expect(result.success).toBe(false);
    expect(result.error).toContain('`content`');
  }, 60_000);

  it("fails the build when a bundleUi pack can't resolve @abuddy/ui", async () => {
    const packDir = makePack({ manifest: { fe: { bundleUi: true } }, linkNodeModules: false });
    const result = await build(packDir);
    expect(result.success).toBe(false);
    expect(result.error).toContain('@abuddy/ui');
    expect(result.error).toContain('fe.bundleUi');
  }, 60_000);

  it("fails the build when abuddy.json can't be read, so fe.bundleUi is unknown", async () => {
    const packDir = makePack({ manifest: '{ not json' });
    const result = await build(packDir);
    expect(result.success).toBe(false);
    expect(result.error).toContain('abuddy.json');
    expect(result.error).toContain('fe.bundleUi');
  }, 60_000);

  it('warns about a tsconfig whose aliases it cannot read', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const packDir = makePack({});
    // Valid JSONC that the alias reader's line-comment stripping can't parse, so its paths are lost
    fs.writeFileSync(
      path.join(packDir, 'tsconfig.json'),
      '{ /* block comment */ "compilerOptions": { "paths": { "#gen/*": ["./src/*"] } } }',
    );
    const result = await build(packDir);
    expect(result.success).toBe(true);
    expect(warn.mock.calls.flat().join('\n')).toContain('tsconfig.json');
  }, 60_000);
});

describe('pack FE Tailwind setup when Tailwind cannot be loaded', () => {
  async function buildWithoutTailwind(packDir: string) {
    vi.resetModules();
    vi.doMock('tailwindcss', () => { throw new Error('Cannot find module tailwindcss'); });
    try {
      const { bundlePackFE: bundle } = await import('../../src/build/fe-bundler');
      return await bundle({ packDir, outputDir: path.join(packDir, 'dist'), entryPoint: path.join(packDir, 'src', 'entry.ts') });
    } finally {
      vi.doUnmock('tailwindcss');
      vi.resetModules();
    }
  }

  it('warns and builds on for a pack that gave no sign it needs Tailwind', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const packDir = makePack({});
    const result = await buildWithoutTailwind(packDir);
    expect(result.success).toBe(true);
    expect(warn.mock.calls.flat().join('\n')).toContain("Tailwind CSS couldn't be loaded");
  }, 60_000);

  it('fails the build for a pack that bundles @abuddy/ui', async () => {
    const packDir = makePack({ manifest: { fe: { bundleUi: true } } });
    const result = await buildWithoutTailwind(packDir);
    expect(result.success).toBe(false);
    expect(result.error).toContain("Tailwind CSS couldn't be loaded");
    expect(result.error).toContain('fe.bundleUi');
  }, 60_000);

  it('fails the build for a pack that has its own tailwind.config', async () => {
    const packDir = makePack({ tailwindConfig: "export default { content: ['./src/**/*.ts'] };\n" });
    const result = await buildWithoutTailwind(packDir);
    expect(result.success).toBe(false);
    expect(result.error).toContain('tailwind.config.ts');
  }, 60_000);
});
