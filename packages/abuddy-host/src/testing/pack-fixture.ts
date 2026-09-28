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
  /** Replaces the manifest outright, for a case about a pack that declares something else. */
  readonly manifest?: unknown;
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
 * A spec in `@abuddy/sdk`, `/ears`, `/ui` or `default-setup` cannot import this — the layer rule reads their
 * `tests/` too. Nothing there builds a pack today; the first one that does is the signal to move this and
 * `population` to an `@app/*` package, rather than to write a second fixture.
 */
export function packFixture({ at, files = {}, manifest = DEFAULT_MANIFEST }: PackFixtureOptions = {}): string {
  const dir = at ?? fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-pack-fixture-'));
  const base: Record<string, string> = {
    'package.json': JSON.stringify({
      name: 'demo-pack', type: 'module',
      imports: { '#generated/*': './src/__generated__/*', '#features/*': './src/features/*' },
    }),
    'abuddy.json': JSON.stringify(manifest),
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
