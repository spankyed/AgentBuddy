// A dependent of two packs that share an ancestor: the diamond.
//
// A snapshot carries what its whole tree declares, because a dependent sees only its direct
// dependencies' snapshots. Attributing an inherited name to the dependency it *arrived through* rather
// than the pack that *declares* it made every diamond read as a collision — and since every pack
// depends on the base pack, that was every pack with two dependencies.
//
// The unit tests over hand-written snapshots pin the algorithm. These build four real packs with the
// real CLI, so they pin that a build writes the attribution a dependent reads.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PACKAGES_BUILT, REPO_ROOT } from '../helpers/published-packages';
import { CLI, buildPack, packageJson, preparePack, run, tsconfig } from '../helpers/pack-builds';

/** A pack declaring `entities`, depending on `dependencies`. Nothing else: the graph is the subject. */
function pack(id: string, entities: Record<string, string>, dependencies: Record<string, string> = {}, extra: Record<string, unknown> = {}) {
  return {
    'package.json': packageJson(id),
    'tsconfig.json': tsconfig,
    'abuddy.json': JSON.stringify({
      id, name: id, version: '1.0.0', entities,
      ...(Object.keys(dependencies).length > 0 && { dependencies }),
      ...extra,
    }),
  };
}

/** A feature with a system and a plugin, so dependents have something a `sendsTo` can name */
const NOTIFIER = {
  features: [{ id: 'notifier', system: { entry: 'src/system.ts' }, plugin: { entry: 'src/plugin.ts' } }],
};
const NOTIFIER_SOURCES = {
  'src/system.ts': [
    "import { setup } from 'xstate';",
    "import { defineSystem, type SystemEntry } from '@abuddy/sdk/framework';",
    "export type OutgoingNotifierEvents = { type: 'NOTIFIED'; text: string };",
    "export const notifierSpec = defineSystem('notifier')<{ type: 'NOTIFY' }, OutgoingNotifierEvents>();",
    'const entry = { spec: notifierSpec, machine: setup({ types: notifierSpec.types }).createMachine({ id: notifierSpec.id }) } satisfies SystemEntry;',
    'export default entry;',
  ].join('\n'),
  'src/plugin.ts': "import type { Plugin } from '@abuddy/sdk/fe';\nexport default { id: 'notifier' } as unknown as Plugin;\n",
};

const DEEP = 'deep-pack';
const on = (...ids: string[]) => Object.fromEntries(ids.map((id) => [id, '*']));

let parent: string;
let built: { code: number; output: string } | undefined;

beforeAll(() => {
  if (!PACKAGES_BUILT) return;
  parent = fs.mkdtempSync(path.join(os.tmpdir(), 'dependency-graph-'));
  const modules = path.join(REPO_ROOT, 'node_modules');
  // D, then B and C on D, then A on B and C: four builds, the budget for this spec
  buildPack(preparePack(parent, DEEP, { ...pack(DEEP, { Memo: 'Memo' }, {}, NOTIFIER), ...NOTIFIER_SOURCES }, modules), DEEP);
  for (const side of ['left-pack', 'right-pack']) {
    buildPack(preparePack(parent, side, pack(side, { [`${side === 'left-pack' ? 'Left' : 'Right'}Note`]: side === 'left-pack' ? 'LeftNote' : 'RightNote' }, on(DEEP)), modules), side);
  }
  const appDir = preparePack(parent, 'app-pack', pack('app-pack', { App: 'App' }, on('left-pack', 'right-pack')), modules);
  built = run(process.execPath, [CLI, 'build'], appDir);
}, 240_000);

afterAll(() => {
  if (parent) fs.rmSync(parent, { recursive: true, force: true });
});

/** A built-in pack writes dist/snapshot.json; an external one writes it into the bundle's types dir */
const snapshotOf = (id: string) => {
  const file = [path.join(parent, id, 'dist', 'snapshot.json'), path.join(parent, id, 'dist', 'types', 'snapshot.json')]
    .find((candidate) => fs.existsSync(candidate));
  if (!file) throw new Error(`no snapshot written for ${id}`);
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
};

describe.skipIf(!PACKAGES_BUILT)('a pack depending on two packs that share an ancestor', () => {
  it('builds, rather than reporting the ancestor as a collision', () => {
    expect(built!.output).not.toContain('Type conflicts');
    expect(built!.code, built!.output).toBe(0);
  });

  // The generated union is what a pack author sees: the ancestor's entity once, not twice and not missing
  it("names the ancestor's entity exactly once in the dependent's EntityName", () => {
    const ears = fs.readFileSync(path.join(parent, 'app-pack', 'src', '__generated__', 'ears.ts'), 'utf-8');
    const entityName = ears.slice(ears.indexOf('export type EntityName'));
    const line = entityName.slice(0, entityName.indexOf(';'));
    expect(line).toContain("'Memo'");
    expect(line.match(/'Memo'/g), line).toHaveLength(1);
    // And both sides' own entities come through alongside it
    for (const name of ['LeftNote', 'RightNote', 'App']) expect(line).toContain(`'${name}'`);
  });

  // What the dependent read to get that right, written by the middle packs' own builds
  it("attributes the ancestor's entity to the ancestor in each side's snapshot", () => {
    for (const side of ['left-pack', 'right-pack']) {
      expect(snapshotOf(side).provenance.entities, side).toMatchObject({ Memo: DEEP });
    }
  });

  it("attributes each pack's own entity to itself", () => {
    expect(snapshotOf('left-pack').provenance.entities).toMatchObject({ LeftNote: 'left-pack' });
    expect(snapshotOf(DEEP).provenance.entities).toEqual({ Memo: DEEP });
  });
});

describe.skipIf(!PACKAGES_BUILT)('a collision that is real', () => {
  // The diamond fix must not swallow this: two packs each declaring `Memo` themselves is not a diamond,
  // and a dependent of both cannot tell which one it means.
  it('still fails when two independent packs declare the same entity', () => {
    const modules = path.join(REPO_ROOT, 'node_modules');
    const rival = 'rival-pack';
    buildPack(preparePack(parent, rival, pack(rival, { Memo: 'Memo' }), modules), rival);

    const clashDir = preparePack(parent, 'clash-pack', pack('clash-pack', {}, on(DEEP, rival)), modules);
    const clash = run(process.execPath, [CLI, 'build'], clashDir);

    expect(clash.code, clash.output).not.toBe(0);
    expect(clash.output).toMatch(/entity "Memo" declared by both/);
  }, 120_000);
});

/**
 * The facade check's failing direction, against a real built snapshot.
 *
 * `requireFacadeExports` refuses a dependency whose facade lacks an export the generated code imports.
 * Every test of it so far has been over a hand-written snapshot object; the passing direction is covered
 * by every other build in this suite. This covers the failing one through an actual `abuddy build`.
 *
 * The facade under test is synthetic in origin though the build around it is real: rather than keeping a
 * second, older toolchain to produce a genuinely outdated facade, a built snapshot is copied and an
 * export removed from it. That is the trade accepted here.
 */
describe.skipIf(!PACKAGES_BUILT)("a dependency whose facade lacks an export", () => {
  /** A copy of the built ancestor with `names` removed from its facade, and a dependent built against it */
  function buildAgainstFacadeWithout(names: string[], dependent: Record<string, string>): { code: number; output: string } {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'facade-gap-'));
    fs.cpSync(path.join(parent, DEEP), path.join(dir, DEEP), { recursive: true, dereference: false });
    const file = [path.join(dir, DEEP, 'dist', 'snapshot.json'), path.join(dir, DEEP, 'dist', 'types', 'snapshot.json')]
      .find((candidate) => fs.existsSync(candidate))!;
    const snapshot = JSON.parse(fs.readFileSync(file, 'utf-8'));
    const facade: string = snapshot.defs['pack-types'];
    expect(facade, 'the ancestor published a facade to strip').toBeTruthy();
    for (const name of names) {
      expect(facade, `facade exports ${name}`).toContain(name);
      snapshot.defs['pack-types'] = snapshot.defs['pack-types'].replaceAll(name, `${name}Renamed`);
    }
    fs.writeFileSync(file, JSON.stringify(snapshot));

    const depDir = preparePack(dir, 'app-pack', dependent, path.join(REPO_ROOT, 'node_modules'));
    const result = run(process.execPath, [CLI, 'build'], depDir);
    fs.rmSync(dir, { recursive: true, force: true });
    return result;
  }

  const plain = pack('app-pack', { App: 'App' }, on(DEEP));

  it('fails naming the missing export and the dependency', () => {
    const result = buildAgainstFacadeWithout(['Repositories'], plain);
    expect(result.code, result.output).not.toBe(0);
    expect(result.output).toContain('`Repositories`');
    expect(result.output).toContain(DEEP);
  }, 120_000);

  /**
   * `PackEvents` is required only of a dependency some `sendsTo` names, so its absence has to fail a
   * dependent that names one of its plugins and not a dependent that names none. Both halves here,
   * because the conditional requirement is the part a single case cannot pin.
   */
  it("fails a dependent whose sendsTo names one of its plugins", () => {
    const sender = {
      ...pack('app-pack', { App: 'App' }, on(DEEP), {
        features: [{ id: 'relay', system: { entry: 'src/system.ts', sendsTo: ['notifier'] }, plugin: { entry: 'src/plugin.ts' } }],
      }),
      'src/system.ts': [
        "import { setup } from 'xstate';",
        "import { defineSystem, type SystemEntry } from '@abuddy/sdk/framework';",
        "export type OutgoingRelayEvents = { type: 'RELAYED' };",
        "export const relaySpec = defineSystem('relay')<{ type: 'RELAY' }, OutgoingRelayEvents>();",
        'const entry = { spec: relaySpec, machine: setup({ types: relaySpec.types }).createMachine({ id: relaySpec.id }) } satisfies SystemEntry;',
        'export default entry;',
      ].join('\n'),
      'src/plugin.ts': "import type { Plugin } from '@abuddy/sdk/fe';\nexport default { id: 'relay' } as unknown as Plugin;\n",
    };
    const result = buildAgainstFacadeWithout(['PackEvents'], sender);
    expect(result.code, result.output).not.toBe(0);
    expect(result.output).toContain('`PackEvents`');
    expect(result.output).toContain('sendsTo');
  }, 120_000);

  it('builds a dependent that names none of them, rather than failing over a type it never imports', () => {
    const result = buildAgainstFacadeWithout(['PackEvents'], plain);
    expect(result.code, result.output).toBe(0);
  }, 120_000);
});
