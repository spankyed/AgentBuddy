import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { init as initLexer, parse } from 'es-module-lexer';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { packExternalsPlugin } from '../../src/build/fe-bundler';
import { PACKAGES_BUILT, REPO_ROOT } from '../helpers/published-packages';

/**
 * A pack's proxy for a host-shared @abuddy/ui module re-exports every name the host's module has.
 * The proxy's names come from the source the pack builds against (SFCs compiled by Vite); the
 * reference is the published build of the same module.
 */
const UI_DIR = path.join(REPO_ROOT, 'packages', 'abuddy-ui');
const uiExports = JSON.parse(fs.readFileSync(path.join(UI_DIR, 'package.json'), 'utf-8')).exports as Record<string, string | { default: string }>;
const specifiers = Object.keys(uiExports).filter((key) => key !== './package.json').map((key) => `@abuddy/ui${key.slice(1)}`);

/** Named exports of a compiled module, following relative `export * from` */
function compiledExports(file: string, seen = new Set<string>()): string[] {
  if (seen.has(file)) return [];
  seen.add(file);
  const code = fs.readFileSync(file, 'utf-8');
  const [imports, exports] = parse(code);
  const names = exports.map((e) => e.n).filter((n) => n !== 'default');
  for (const imp of imports) {
    if (imp.n?.startsWith('.') && /^export\s*\*\s*from\b/.test(code.slice(imp.ss, imp.se))) {
      names.push(...compiledExports(path.resolve(path.dirname(file), imp.n), seen));
    }
  }
  return [...new Set(names)].sort();
}

let packDir: string;
const proxies = new Map<string, string[]>();

beforeAll(async () => {
  if (!PACKAGES_BUILT) return;
  await initLexer;
  packDir = fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-proxy-exports-'));
  fs.writeFileSync(path.join(packDir, 'package.json'), JSON.stringify({ name: 'proxy-pack', type: 'module' }));
  fs.writeFileSync(path.join(packDir, 'abuddy.json'), JSON.stringify({ id: 'proxy-pack', name: 'Proxy', version: '1.0.0' }));
  fs.symlinkSync(path.join(REPO_ROOT, 'node_modules'), path.join(packDir, 'node_modules'), 'dir');
  const entry = path.join(packDir, 'entry.ts');
  fs.writeFileSync(entry, specifiers.map((s, i) => `export * as m${i} from '${s}';`).join('\n'));

  const vite = await import('vite');
  const vue = (await import('@vitejs/plugin-vue')).default;
  await vite.build({
    root: packDir,
    configFile: false,
    logLevel: 'error',
    plugins: [
      packExternalsPlugin(packDir),
      vue(),
      {
        name: 'capture-proxies',
        transform(code, id) {
          if (!id.startsWith('\0pack-external:@abuddy/ui/')) return;
          proxies.set(id.slice('\0pack-external:'.length), parse(code)[1].map((e) => e.n).filter((n) => n !== 'default').sort());
        },
      },
    ],
    resolve: { conditions: ['@abuddy/source', ...vite.defaultClientConditions] },
    build: { lib: { entry, formats: ['es'], fileName: 'fe' }, outDir: path.join(packDir, 'dist'), write: false },
  });
}, 120_000);

afterAll(() => {
  if (packDir) fs.rmSync(packDir, { recursive: true, force: true });
});

describe.skipIf(!PACKAGES_BUILT)('host-shared @abuddy/ui proxies', () => {
  it('cover every @abuddy/ui export', () => {
    expect([...proxies.keys()].sort()).toEqual([...specifiers].sort());
  });

  it.each(specifiers)('%s re-exports the names of its published build', (specifier) => {
    const target = uiExports[`.${specifier.slice('@abuddy/ui'.length)}`] as { default: string };
    expect(proxies.get(specifier)).toEqual(compiledExports(path.join(UI_DIR, target.default)));
  });
});
