import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/**
 * One feature, both halves, each naming an entry and a contract — which is what makes a rule about contracts
 * able to fire. Which module is a contract is what `abuddy.json` says, not what a file looks like, so a fixture
 * without a manifest is one several pack rules cannot speak about at all.
 */
const DEFAULT_MANIFEST = {
  id: 'demo-pack', name: 'Demo', version: '1.0.0',
  features: [{
    id: 'notes',
    plugin: { entry: 'src/features/notes/fe/plugin.ts', contract: 'src/features/notes/fe/contract.ts#Contract' },
    system: { entry: 'src/features/notes/be/system.ts', contract: 'src/features/notes/be/contract.ts#Contract' },
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
 * **It lived in `@abuddy/sdk/testing` until 2026-10-02**, where its own comment named the condition for
 * moving: a second consumer. Two arrived (`@app/repo-checks`, `@abuddy/cli`), and the cost of staying was
 * concrete — a repo-internal fixture in a published package's *reviewed* surface, carried in
 * `etc/testing.api.md` and shipped in the tarball for something no pack author materialises a pack to test.
 *
 * `population` did not come with it: `@app/default-setup`'s tests use it, and a pack may not import an
 * `@app/*` package. So a spec in `@abuddy/sdk`, `/ears`, `/ui` or `default-setup` still cannot import this —
 * the layer rule reads their `tests/` too — and nothing there builds a pack.
 *
 * **It makes a pack's *source* tree and stops there.** Building one is `buildPack(dir)` and installing one is
 * the installer's own helper: composition, not options, because both already take a directory. A `built: true`
 * option was considered and dropped for that reason — it would own a second way to call something that works.
 * The *installed* shape (a manifest beside `integrity.json`, a snapshot and `dist/runtime`) is a different
 * artifact whose layout `@abuddy/host` owns (`PACK_LAYOUT`), and host's own tests build it in host, where the
 * layer rule keeps it.
 */
export function packFixture({ at, files = {}, manifest, rawManifest }: PackFixtureOptions = {}): string {
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
    'src/features/notes/fe/plugin.ts': 'export type P = { id: string };\n',
    'src/features/notes/be/system.ts': 'export const system = 1;\n',
    'src/features/notes/fe/contract.ts': 'export type Contract = { state: {} };\n',
    'src/features/notes/be/contract.ts': "export type Contract = { outgoing: { type: 'A' } };\n",
  };
  for (const [rel, body] of Object.entries({ ...base, ...files })) {
    const file = path.join(dir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, body);
  }
  return dir;
}
