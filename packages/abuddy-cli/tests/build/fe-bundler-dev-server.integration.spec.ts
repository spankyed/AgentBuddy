// **The dev server is a second context for this plugin, and nothing drove it until now.**
//
// `abuddy run` serves a pack's frontend from `vite.createServer`, where every other spec here builds with
// `vite.build`. The two give a plugin different `PluginContext`s: in a build, `ctx.load({ id })` answers with
// Rollup's ModuleInfo and its `code`; in dev, `getModuleInfo` hands back a Proxy carrying `id` and `meta` and
// **throws for every other property** ("The %s property of ModuleInfo is not supported"). So the proxy module
// `packExternalsPlugin` generates for a host-shared module failed to load for the whole life of `abuddy run`,
// which printed "FE changes hot-reload via Vite HMR" over a loop that did nothing at all.
//
// Measured against the external-pack fixture, 2026-10-07, editing a `.vue`:
//
// | | pre-transform errors | what Vite decided |
// |---|---|---|
// | before | 7 | nothing — no modules in the graph to match |
// | after | 0 | `page reload src/features/memos/fe/canvas/list.vue` |
//
// A reload and not a component update, because the app imports the pack's entry through `pack://`, outside
// Vite's graph, so no importer is there to accept one. That is the ceiling of this path, and why
// `docs/archive/goals/goal-one-kind-of-pack.md` keeps a dev-only source import for a pack whose source is on disk.
//
// In the expensive half for the reason the sibling proxy-exports spec is: it runs a real Vite.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { init as initLexer, parse } from 'es-module-lexer';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { packFixture } from '@abuddy/sdk/testing/pack-fixture';
import { packDevServerConfig } from '../../src/build/fe-bundler';
import { REPO_ROOT } from '@abuddy/host/build/packages-built';

/** A host-shared module: the pack must get the app's instance, so the plugin serves a proxy over `window.__abuddy` */
const SHARED = '@abuddy/sdk/fe';
/** A name that module really exports, so "the proxy has names" cannot pass on an empty one */
const EXPORTED = 'usePlugin';

let server: Awaited<ReturnType<typeof import('vite').createServer>>;
let packDir: string;

beforeAll(async () => {
  await initLexer;
  packDir = packFixture({ manifest: { id: 'dev-pack', name: 'Dev' }, nodeModules: path.join(REPO_ROOT, 'node_modules') });
  const entry = path.join(packDir, 'entry.ts');
  fs.writeFileSync(entry, `export { ${EXPORTED} } from '${SHARED}';\n`);

  const vite = await import('vite');
  // The config `abuddy run` serves with, not a copy of it: the first draft of this spec wrote its own and left
  // out `optimizeDeps.exclude`, which put the dep optimizer in the way of evidence about something else
  const config = await packDevServerConfig(packDir, entry);
  server = await vite.createServer({
    ...config,
    logLevel: 'silent',
    server: { ...config.server, middlewareMode: true, port: undefined },
  });
}, 60_000);

afterAll(async () => { await server?.close(); });

// Through the dev environment's own plugin container, which is the context `abuddy run` puts the plugin in —
// rather than a `/@id/` URL, whose encoding is Vite's business and not what this is about
it('serves the proxy for a host-shared module, naming what that module exports', async () => {
  const { pluginContainer } = server.environments.client;
  const importer = path.join(packDir, 'entry.ts');

  const resolved = await pluginContainer.resolveId(SHARED, importer);
  expect(resolved?.id, `${SHARED} resolved to nothing, so the plugin never claimed it`).toBeTruthy();

  const loaded = await pluginContainer.load(resolved!.id);
  const code = typeof loaded === 'string' ? loaded : loaded?.code;
  expect(code, `the plugin served no proxy for ${SHARED}`).toBeTruthy();

  const names = parse(code!)[1].map((e) => e.n);
  expect(names, 'the proxy named no exports, so every import of it is undefined at runtime').not.toEqual([]);
  expect(names).toContain(EXPORTED);
});
