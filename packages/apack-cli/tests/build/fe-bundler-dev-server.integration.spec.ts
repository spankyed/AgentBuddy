/**
 * **The dev server is a second context for this plugin, and it can disagree with a build.**
 *
 * `apack pack dev` serves a pack's frontend from `vite.createServer`, where every other spec here builds with
 * `vite.build`. The two give a plugin different `PluginContext`s, and the half that matters now is what Vite
 * does with a specifier the plugin refuses to resolve: a build emits the bare name into the chunk, while a
 * dev server runs `vite:import-analysis` over the served module and rewrites, or rejects, what it can reach.
 * An external that survived the build and not the dev server would be a pack whose frontend loads from
 * `dist` and 500s under `apack pack dev`.
 *
 * The ceiling of this path, worth knowing before reading a result here: the app imports the pack's entry
 * through `pack://`, outside Vite's module graph, so an edit is a `page reload` and never a component
 * update — no importer is in the graph to accept one. A pack whose source is on this disk is served from
 * the renderer's own graph instead, which is what `dev-pack-hmr.integration.spec.ts` holds.
 *
 * In the expensive half because it stands a real Vite dev server up.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { packFixture } from '@apackdev/sdk/testing/pack-fixture';
import { packDevServerConfig } from '../../src/build/fe-bundler';
import { REPO_ROOT } from '@apackdev/host/build/packages-built';
import { replaceDir } from '@apackdev/host/replace-dir';

/** A host-shared module: the pack must get the app's instance, so the server leaves it for the import map */
const SHARED = '@apackdev/sdk/fe';
/** A name it really exports, so the import under test is one a pack could actually write */
const EXPORTED = 'usePlugin';

let server: Awaited<ReturnType<typeof import('vite').createServer>>;
let packDir: string;
let entry: string;
let origin: string;

beforeAll(async () => {
  // Realpath'd: on macOS the temp dir is reached through a symlink, and a root that is not the real path puts
  // every file in it outside `server.fs.allow`, which reads as "does the file exist?"
  packDir = fs.realpathSync(packFixture({ manifest: { id: 'dev-pack', name: 'Dev' }, nodeModules: path.join(REPO_ROOT, 'node_modules') }));
  entry = path.join(packDir, 'entry.ts');
  fs.writeFileSync(entry, `export { ${EXPORTED} } from '${SHARED}';\n`);

  const vite = await import('vite');
  // The config `apack pack dev` serves with, not a copy of it: the first draft of this spec wrote its own and left
  // out `optimizeDeps.exclude`, which put the dep optimizer in the way of evidence about something else.
  // **Listening on a real port, not middlewareMode**, because one of the two answers below is a response
  // body: what the `pack://` handler proxies is an HTTP request, and a middleware is the only hook that runs
  // after `vite:import-analysis`.
  const config = await packDevServerConfig(packDir, entry);
  server = await vite.createServer({ ...config, logLevel: 'silent', server: { ...config.server, port: 0, strictPort: false } });
  await server.listen();
  const address = server.httpServer!.address();
  origin = `http://localhost:${typeof address === 'object' && address !== null ? address.port : 0}`;
}, 60_000);

afterAll(async () => { await server?.close(); });

// Through the dev environment's own plugin container, which is the context `apack pack dev` puts the plugin in —
// rather than a `/@id/` URL, whose encoding is Vite's business and not what this is about
it('claims a host-shared module and leaves it external', async () => {
  const { pluginContainer } = server.environments.client;

  const resolved = await pluginContainer.resolveId(SHARED, entry);

  expect(resolved?.id, `${SHARED} resolved to nothing, so the plugin never claimed it`).toBe(SHARED);
  expect(resolved?.external, `${SHARED} was resolved into the pack instead of left to the host`).toBeTruthy();
});

// The half the plugin container cannot answer. `vite:import-analysis` rewrites what it serves, and an
// external it rewrites to `/@id/<specifier>` — which the browser resolves against the module's own `pack://`
// URL and asks *this* server for, where nothing can answer it. So the pack's frontend has to arrive naming
// the specifier, for the document's import map to resolve.
it('serves the pack entry with the specifier still bare', async () => {
  const res = await fetch(`${origin}/entry.ts`);
  const code = await res.text();

  expect(res.ok, `the dev server answered ${res.status} for the pack entry`).toBe(true);
  expect(code, `${SHARED} was rewritten to a URL only this server could answer, so the import map never sees it`)
    .not.toContain(`/@id/${SHARED}`);
  expect(code).toContain(`"${SHARED}"`);
  expect(code, 'the dev server pre-bundled the shared module, so the pack would get its own copy')
    .not.toContain('/node_modules/.vite/deps/');
});

it.runIf(process.platform === 'win32')('publishes staged output while retained dev servers watch authored files', async () => {
  const children: ReturnType<typeof fork>[] = [];
  const staged = path.join(packDir, '.apack', 'build');
  const dest = path.join(packDir, 'dist');
  const options = await packDevServerConfig(packDir, entry);
  const ignored = options.server?.watch && options.server.watch.ignored;
  if (typeof ignored !== 'function') throw new Error('Expected a Vite watch predicate');
  expect(ignored(path.toNamespacedPath(staged))).toBe(true);
  expect(ignored(path.join(packDir, 'src/__generated__/entry.ts'))).toBe(false);
  expect(ignored(path.join(path.dirname(packDir), '.apack/dependency.ts'))).toBe(false);
  fs.mkdirSync(path.dirname(staged), { recursive: true });
  const watcher = fs.watch(packDir, { recursive: true }, () => {});
  try {
    for (let i = 0; i < 2; i++) {
      const child = fork(new URL('../_support/vite-dev-server.mjs', import.meta.url), [packDir, entry], {
        cwd: packDir, stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
        execArgv: ['--conditions=@apackdev/source', '--import', pathToFileURL(path.join(REPO_ROOT, 'node_modules/tsx/dist/loader.mjs')).href],
      });
      children.push(child);
      const [message] = await once(child, 'message', { signal: AbortSignal.timeout(15_000) });
      expect(message).toBe('ready');
    }
    for (let iteration = 0; iteration < 10; iteration++) {
      fs.mkdirSync(staged, { recursive: true });
      for (let directory = 0; directory < 12; directory++) {
        const part = path.join(staged, String(directory));
        fs.mkdirSync(part);
        for (let file = 0; file < 12; file++) fs.writeFileSync(path.join(part, `${file}.json`), JSON.stringify(iteration));
      }
      replaceDir(staged, dest);
      expect(fs.readFileSync(path.join(dest, '0/0.json'), 'utf8')).toBe(JSON.stringify(iteration));
    }
    const changed = once(server.watcher, 'change', { signal: AbortSignal.timeout(2_000) });
    fs.appendFileSync(entry, '\nexport const publicationMarker = "AUTHORED_AFTER_PUBLICATION";\n');
    expect(path.normalize((await changed)[0])).toBe(entry);
    expect(await (await fetch(`${origin}/entry.ts`)).text()).toContain('AUTHORED_AFTER_PUBLICATION');
  } finally {
    watcher.close();
    for (const child of children) {
      if (child.exitCode !== null || child.signalCode !== null) continue;
      const exited = once(child, 'exit');
      const terminate = setTimeout(() => child.kill(), 2_000);
      if (child.connected) child.send('close', () => {}); else child.kill();
      try { await exited; } finally { clearTimeout(terminate); }
    }
  }
});
