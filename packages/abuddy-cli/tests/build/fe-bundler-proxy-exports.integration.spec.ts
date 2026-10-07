// In the expensive half because it runs a real Vite build, which is this package's rule for that half.
//
// **The first spec in this repo to change halves on the slow report's evidence**, moved 2026-10-06. It was
// the fast half's costliest at 3.07s — against `run-install`'s 3.05s, which spawns nothing, and the two
// other fe-bundler specs at 1.5s and 1.3s, which build but need none of what this half gives. What decided
// it is not the 3.07s but `vite.build` below: a multi-threaded bundler running in a nine-worker pool
// oversubscribes the box, which is what the capped pool here exists for.
//
// It is a *decision* and not a measurement — the filename is the whole mechanism, and nothing re-derives
// it. `spec-cost.json` tried deciding this from a recorded millisecond and the root guide's sample section
// has what that cost.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { init as initLexer, parse } from 'es-module-lexer';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { packFixture } from '@abuddy/sdk/testing/pack-fixture';
import { packDevServerConfig, packExternalsPlugin } from '../../src/build/fe-bundler';
import { packagesBuiltOrRefuse, REPO_ROOT } from '@abuddy/host/build/packages-built';

/** Skips without built packages, and refuses rather than reading a stale `dist` */
const PACKAGES_BUILT = packagesBuiltOrRefuse('npm run packages:build (or npm test -w @abuddy/cli, which builds them)');

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
  packDir = packFixture({ manifest: { id: 'proxy-pack', name: 'Proxy' }, nodeModules: path.join(REPO_ROOT, 'node_modules') });
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
});

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

  /**
   * **The two contexts must name the same exports**, which is a claim neither side makes alone.
   *
   * A build takes the names from Rollup's compiled module; a dev server cannot — `ModuleInfo` throws for `code`
   * there — so it reads the file and strips types with esbuild (`compiledSource`, `fe-bundler.ts`). Two
   * mechanisms for one answer is a divergence waiting to happen, and its symptom is the worst kind: a named
   * import that is defined in a packaged app and `undefined` under `abuddy run`, or the reverse.
   *
   * So this asks them to agree, over every specifier the build half already covers. It is the guard on the
   * esbuild path, and the reason to write it is that the path exists at all.
   */
  it('name the same exports under a dev server as they do in a build', async () => {
    const vite = await import('vite');
    const config = await packDevServerConfig(packDir, path.join(packDir, 'entry.ts'));
    const server = await vite.createServer({
      ...config,
      logLevel: 'silent',
      server: { ...config.server, middlewareMode: true, port: undefined },
    });
    try {
      const { pluginContainer } = server.environments.client;
      const importer = path.join(packDir, 'entry.ts');
      const disagreed: string[] = [];
      for (const specifier of specifiers) {
        const resolved = await pluginContainer.resolveId(specifier, importer);
        const loaded = resolved ? await pluginContainer.load(resolved.id) : null;
        const code = typeof loaded === 'string' ? loaded : loaded?.code;
        const names = code ? parse(code)[1].map((e) => e.n).filter((n) => n !== 'default').sort() : [];
        const built = proxies.get(specifier) ?? [];
        if (names.join() !== built.join()) disagreed.push(`${specifier}: dev [${names}] vs build [${built}]`);
      }
      expect(disagreed, 'a proxy names different exports in dev than in a build').toEqual([]);
    } finally {
      await server.close();
    }
  });
});
