import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/**
 * One feature, both halves, each naming an entry and a contract — which is what makes a rule about contracts
 * able to fire. Which module is a contract is what `abuddy.json` says, not what a file looks like, so a fixture
 * without a manifest is one several pack rules cannot speak about at all.
 *
 * **The feature id is deliberately not one `@app/default-setup` has.** It was `notes`, which that pack really
 * ships, so `src/features/notes/` named a fixture's invention and a real feature at once — in a grep, in a
 * failure message, and in a spec that writes a path meant to read as the real pack's (`findRepositoryCasts`
 * does, a few hundred lines into `import-specifiers.integration.spec.ts`). Keep it a name no pack takes.
 */
const DEFAULT_MANIFEST = {
  id: 'demo-pack', name: 'Demo', version: '1.0.0',
  features: [{
    id: 'memos',
    plugin: { entry: 'src/features/memos/fe/plugin.ts', contract: 'src/features/memos/fe/contract.ts#Contract' },
    system: { entry: 'src/features/memos/be/system.ts', contract: 'src/features/memos/be/contract.ts#Contract' },
  }],
};

export interface PackFixtureOptions {
  /** Where to write it. A fresh temp directory by default, which the caller owns and removes. */
  readonly at?: string;
  /** Written over the base, keyed by path relative to the pack: the offending module a case is about. */
  readonly files?: Record<string, string>;
  /**
   * Merged over the default manifest, one key deep — `{ id: 'other' }` keeps the feature the default
   * declares, and `{ dependencies: {…} }` adds one without restating the rest.
   *
   * **Merge rather than replace, because that is what the call sites want.** Surveyed 2026-10-02 over the 54
   * manifest-writing sites in the two packages that may import this: 23 of the 28 written inline are the
   * minimum plus at most one key — `{ id, name, version }`, sometimes with `features`, `dependencies`,
   * `entities` or `builtIn`. Replacing meant each of those restated a whole manifest, which is how they came
   * to differ from each other in ways no case was about.
   */
  readonly manifest?: Record<string, unknown>;
  /**
   * Symlinked as the pack's `node_modules`, which is what makes `@abuddy/*` resolve from inside the fixture —
   * every spec that builds or bundles one needs it.
   *
   * Here because it repeated: four specs wrote the same `mkdtemp` + manifest + `symlinkSync(REPO_ROOT/
   * node_modules)` preamble (`host-import-guard`, `fe-bundler-proxy-exports`, `fe-bundler-shared-ui`,
   * `seed-runtime-load`), and `preparePack` is that pair with a name. A spec that only reads the tree passes
   * nothing and gets no symlink.
   */
  readonly nodeModules?: string;
  /**
   * Written verbatim, for a case whose subject *is* the manifest: one the installer must reject, one missing
   * a required key, one that is not an object. Five of the 28 are this.
   *
   * Separate from `manifest` rather than a mode on it, because a merge cannot express a *missing* key and a
   * reader should not have to work out which of two meanings applies. Passing both is refused.
   */
  readonly rawManifest?: unknown;
}

/**
 * A pack on disk, complete by default: both subpath maps, a manifest declaring a feature's two halves, and the
 * files those paths name.
 *
 * Complete is the whole point. The shapes this replaces were each missing something — a manifest, a
 * `#features/*` map — and a fixture too thin for a rule to fire is a case that passes because it could not
 * fail. `import-specifiers.integration.spec.ts` measured that: half its sweep ran on a fixture where
 * `own-modules` and `contract-leaves` could not speak, so for those rows the sweep asserted nothing.
 *
 * **It sits in a published package and is not published**, as `@abuddy/sdk/testing/pack-fixture`: an entry whose
 * only branch is `@abuddy/source`, which `publishedManifest` drops from the published manifest outright. So it
 * ships in no tarball, appears in no `etc/*.api.md`, is seen by neither `api:check` nor `api:stamp`, and no pack
 * can resolve it — a pack's config may not declare that condition (`check:specifiers`). Deliberately not
 * exported from `testing/index.ts`, which is published. `./runtime/internals` is the same shape.
 *
 * **The condition that would make it public API: a published pack-reading API.** Today every consumer of a pack
 * directory is private — the pack rules and the source parser are `@abuddy/cli`'s, which publishes no
 * declarations, and the layout, subpath-imports and own-module-specifier readers are the private
 * `@abuddy/host`'s. A fixture for tooling nobody outside can import has no user outside, and a pack author
 * tests their own pack, which is already a directory (`PACK_DIR`), or their pack's code through
 * `setupPackTests`, which takes a registration rather than a tree. Publish any of that pack-reading surface and
 * this should go public in the same change; until then publishing it would fix the default manifest's shape,
 * the `manifest`/`rawManifest` split and these stub files as contract — and the default is chosen to make
 * *this repo's* pack rules fire, which is the wrong promise to make to anyone else.
 *
 * **It makes a pack's *source* tree and stops there.** Building one is `buildPack(dir)` and installing one is
 * the installer's own helper: composition, not options, because both already take a directory. A `built: true`
 * option was considered and dropped for that reason — it would own a second way to call something that works.
 * The *installed* shape (a manifest beside `integrity.json`, a snapshot and `dist/runtime`) is a different
 * artifact whose layout `@abuddy/host` owns (`PACK_LAYOUT`), and host's own tests build it in host, where the
 * layer rule keeps it.
 */
export function packFixture({ at, files = {}, manifest, rawManifest, nodeModules }: PackFixtureOptions = {}): string {
  if (manifest !== undefined && rawManifest !== undefined) {
    throw new Error('packFixture: pass `manifest` to vary the default or `rawManifest` to write one verbatim, not both');
  }
  const written = rawManifest !== undefined ? rawManifest : { ...DEFAULT_MANIFEST, ...manifest };
  const dir = at ?? fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-pack-fixture-'));
  const base: Record<string, string> = {
    'package.json': JSON.stringify({
      name: 'demo-pack', type: 'module',
      imports: { '#generated/*': './src/__generated__/*', '#features/*': './src/features/*' },
    }),
    'abuddy.json': JSON.stringify(written),
    'src/__generated__/events.ts': 'export const sendToSystem = 1;\n',
    'src/sibling.ts': 'export const sibling = 1;\n',
    'src/features/memos/fe/plugin.ts': 'export type P = { id: string };\n',
    'src/features/memos/be/system.ts': 'export const system = 1;\n',
    'src/features/memos/fe/contract.ts': 'export type Contract = { state: {} };\n',
    'src/features/memos/be/contract.ts': "export type Contract = { outgoing: { type: 'A' } };\n",
  };
  for (const [rel, body] of Object.entries({ ...base, ...files })) {
    const file = path.join(dir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, body);
  }
  if (nodeModules !== undefined) fs.symlinkSync(nodeModules, path.join(dir, 'node_modules'), 'dir');
  return dir;
}
