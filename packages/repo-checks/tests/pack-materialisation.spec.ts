import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '@abuddy/host/build/packages-built';
import { population } from '@abuddy/sdk/testing';
import { DIR_BY_PACKAGE } from '../../../scripts/lib/workspace-deps.ts';
import { FIXTURE_PACKAGE, importsFixture, manifestInventory, manifestMentions, packagesUsingFixtures, PACK_FIXTURE, testFilesPoliced } from '../../../scripts/lib/pack-materialisation.ts';

/**
 * Which tests still name a pack manifest themselves, and how often.
 *
 * `packFixture` exists so that one place decides what a pack on disk looks like, and a fixture too thin for a
 * rule to fire is a case that passes because it could not fail — measured: half of
 * `import-specifiers.integration`'s sweep once ran on a fixture where two of its rules could not speak.
 *
 * **This is an inventory and not a verdict, because three verdicts in a row were wrong.** The last one asked
 * for a `JSON.stringify` of an object literal declaring an `id`, reached through a name the file imported from
 * `node:fs`, and reported **zero** over a population holding **seven** hand-built manifests: each goes through
 * a one-line local wrapper, so the filename and the manifest end up in different calls. Two more shapes it
 * could not have seen whatever its predicate: a manifest in a `files` map, which is an object property rather
 * than a call argument at all, and a literal hoisted into a `const`.
 *
 * So nothing here judges. Every row is a file that names a manifest, with how many times and why, and the
 * detector is the dumbest complete thing — a string literal naming the manifest. A *gate* fails on a hit and
 * so must be precise; an inventory fails on a **change** and so wants recall, which is cheap. A spec that only
 * reads a manifest earns a row saying so instead of a false positive to argue with.
 *
 * What the record is for: a spec using the fixture writes no manifest and needs no row, so this is the list of
 * tests that have not adopted it, and the rows saying *not yet converted* are the work left. The counts are
 * here because "which files" and "how many" are different questions — a second hand-built manifest in a file
 * already listed is exactly the creep a verdict waves through.
 */
const INVENTORY: Record<string, { mentions: number; why: string }> = {
  'packages/abuddy-cli/tests/build/build-registry.spec.ts': { mentions: 1,
    why: 'a manifest literal through a local `write`, for the pack whose definitions the build registers — not yet converted' },
  'packages/abuddy-cli/tests/build/dependency-graph.integration.spec.ts': { mentions: 1,
    why: 'a manifest literal in a `files` map handed to a local writer — not yet converted' },
  'packages/abuddy-cli/tests/build/facade-gate-system-contract.integration.spec.ts': { mentions: 1,
    why: 'a `files` map whose manifest is a module constant the cases vary: which module is a contract is what the manifest says, which is the subject' },
  'packages/abuddy-cli/tests/build/facade-typing.integration.spec.ts': { mentions: 2,
    why: 'two packs with a dependency edge, a manifest literal each in a `files` map — not yet converted' },
  'packages/abuddy-cli/tests/build/fe-bundler-tailwind.spec.ts': { mentions: 2,
    why: 'the manifest a case writes to set or break `fe.bundleUi`, and the assertion that the build error names it when it cannot be read' },
  'packages/abuddy-cli/tests/build/pack-rules.spec.ts': { mentions: 1,
    why: "a `'{}'` discovery marker: a directory holding *any* manifest is the subject, and content would slow the walk for nothing" },
  'packages/abuddy-cli/tests/build/snapshot-entity-names.spec.ts': { mentions: 4,
    why: "reads default-setup's real manifest and a fixture pack's, to hold declared entity names to the snapshot" },
  'packages/abuddy-cli/tests/build/types-bundler-determinism.integration.spec.ts': { mentions: 1,
    why: 'a manifest literal in a `files` map, built twice and compared — not yet converted' },
  'packages/abuddy-cli/tests/commands/add-extensions.integration.spec.ts': { mentions: 3,
    why: 'read-modify-write of the manifest `abuddy init` scaffolded, which is what `abuddy add` does to one' },
  'packages/abuddy-cli/tests/commands/add-feature-validate.integration.spec.ts': { mentions: 4,
    why: 'the same, for the designation `add feature` writes into it and `validate` reads back' },
  'packages/abuddy-cli/tests/commands/facade-report.spec.ts': { mentions: 2,
    why: 'a minimal manifest in a `files` map, in two places — not yet converted' },
  'packages/abuddy-cli/tests/commands/init-install-load.spec.ts': { mentions: 4,
    why: 'asserts `init` wrote one, reads it back, patches it, and asserts the installed copy has one' },
  'packages/abuddy-cli/tests/commands/install-host-version.spec.ts': { mentions: 3,
    why: 'a manifest literal through a local `write` varying `hostVersion` (not yet converted), plus two assertions that the installed pack has one' },
  'packages/abuddy-cli/tests/commands/pack-cli.spec.ts': { mentions: 5,
    why: 'a manifest handed in as an identifier — the manifest is the subject — plus reads and existence checks over what pack and install produced' },
  'packages/abuddy-cli/tests/commands/pack-generate.spec.ts': { mentions: 1,
    why: 'a manifest handed in as an identifier: it is the subject, and a pack tree around it would change what the command reads' },
  'packages/abuddy-cli/tests/commands/release.integration.spec.ts': { mentions: 9,
    why: "a manifest literal through a local `write` (not yet converted), then the release's own reads and rewrites: the version it bumps, the file it stages, the hostVersion it requires" },
  'packages/abuddy-cli/tests/commands/scaffold.integration.spec.ts': { mentions: 4,
    why: 'reads what `abuddy init` and `abuddy add` wrote, and patches it back' },
  'packages/abuddy-cli/tests/harness/dependency-runtime.integration.spec.ts': { mentions: 1,
    why: 'a manifest literal through a local `write`, for a pack depending on default-setup — not yet converted' },
  'packages/abuddy-cli/tests/harness/harness-setup.integration.spec.ts': { mentions: 1,
    why: 'a manifest literal through a local `write`, spread over a per-case override — not yet converted' },
  'packages/abuddy-cli/tests/packs/host-output.spec.ts': { mentions: 1,
    why: "a manifest identifier written into the published host-output shape, which is `@abuddy/host`'s artifact" },
  'packages/repo-checks/tests/dep-files.integration.spec.ts': { mentions: 1,
    why: "names default-setup's real manifest as a declared input of `compile`; there is no pack tree here" },
  'packages/repo-checks/tests/import-specifiers.integration.spec.ts': { mentions: 6,
    why: "three `'{}'` discovery markers, where a directory holding any manifest is the subject, and three manifest literals through `writeAt` — those three not yet converted" },
  'packages/repo-checks/tests/spec-plan.spec.ts': { mentions: 4,
    why: "names default-setup's real manifest as a changed file, to assert how `npm run spec` routes a pack's build input" },
};

describe('which tests name a pack manifest', () => {
  it('is the inventory, in both directions', () => {
    const found = manifestInventory(population('test files covered', testFilesPoliced()), REPO_ROOT);
    expect(Object.keys(found).length, 'nothing names a manifest, so this would pass over nothing')
      .toBeGreaterThan(10);

    const recorded = Object.fromEntries(Object.entries(INVENTORY).map(([file, { mentions }]) => [file, mentions]));
    expect(found, 'a file naming a manifest with no row, a row for a file that no longer does, or a count that moved. '
      + 'Ask packFixture for the pack where that is what is wanted; otherwise add the row with its reason').toEqual(recorded);
  });

  /**
   * The inventory follows its input, which is the half its predecessor got wrong.
   *
   * A check comparing a derived answer against a recorded one can be stubbed to return nothing and still pass
   * if the case doctors the expectation instead — `subprocess-inventory`'s predecessor did exactly that,
   * comparing three entries against two. So this drops a file from the **input** and requires the answer to
   * follow it.
   */
  it('follows the files it is given rather than the record', () => {
    const files = testFilesPoliced();
    const dropped = Object.keys(INVENTORY)[0]!;
    expect(files, 'the file this drops is not in the population, so the case proves nothing').toContain(dropped);
    expect(manifestInventory(files.filter((file) => file !== dropped), REPO_ROOT)).not.toHaveProperty(dropped);
  });

  it('counts a literal naming the manifest, wherever it sits, and nothing that merely mentions it', () => {
    expect(manifestMentions("write('abuddy.json', JSON.stringify({ id: 'x' }));"), 'through a local wrapper').toBe(1);
    expect(manifestMentions("const files = { 'abuddy.json': '{}' };"), 'as an object key, which no call carries').toBe(1);
    expect(manifestMentions("writeAt('pack/abuddy.json', body);"), 'under a prefix: a path says where, not whether').toBe(1);
    expect(manifestMentions("it('fails when abuddy.json cannot be read', () => {});"), 'a prose mention is not one').toBe(0);
    expect(manifestMentions('// abuddy.json is the manifest'), 'nor is a comment').toBe(0);
  });

  /**
   * The population is read from the imports, so it is a predicate and needs a firing case of its own: a
   * spelling it fails to recognise drops a whole package out of the sweep while every case here stays green,
   * which is the direction no assertion downstream can see.
   */
  it('sees an import of the fixture by its subpath', () => {
    expect(importsFixture(`import { packFixture } from '${PACK_FIXTURE}';`, 'some.spec.ts')).toBe(true);
  });

  it.each([
    ['a file that imports nothing of the sort', "import { buildPack } from './pack-builds.ts';"],
    ['a mention in a comment rather than an import', '// packFixture writes a pack-fixture tree'],
    ['the relative path only the defining package can write', "import { packFixture } from '../../src/testing/pack-fixture.ts';"],
  ])('does not take %s for an import', (_what, line) => {
    expect(importsFixture(line, 'some.spec.ts')).toBe(false);
  });

  /**
   * And the package that *publishes* the fixture is not policed, which needs saying because it reads as a
   * gap and is the opposite.
   *
   * It was policed for a day. `@abuddy/sdk` holds the fixture, so the spec beside it satisfied "imports the
   * fixture" trivially, which pulled in that package's other 64 test files and produced one finding that
   * read as real: two specs writing a manifest through a local `fs` wrapper, which the predicate cannot see
   * — and which are correctly hand-written anyway, both being a manifest that *is* the subject
   * (`compilePack` reads `abuddy.json` alone, which is what those cases are about). A package is policed for
   * adopting the fixture, and holding it is not adopting it.
   */
  it('leaves out the package the fixture is published from, even when its tests use the subpath', () => {
    const owner = DIR_BY_PACKAGE.get(FIXTURE_PACKAGE);
    expect(owner, `${FIXTURE_PACKAGE} is no workspace, so this case excludes nothing`).toBeDefined();

    // Over a root of its own, with the import spelled the way an outside package spells it. Asking the real
    // tree cannot tell the exclusion from the specifier rule — the defining package imports its own file
    // relatively, which `importsFixture` already declines — so that version passed whether or not the
    // exclusion was there, which is the shape of a case that proves nothing.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fixture-owner-'));
    try {
      const tests = path.join(root, 'packages', owner!, 'tests');
      fs.mkdirSync(tests, { recursive: true });
      fs.writeFileSync(path.join(tests, 'uses.spec.ts'), `import { packFixture } from '${PACK_FIXTURE}';\n`);

      expect(packagesUsingFixtures(root), 'the package that holds the fixture is policed for holding it')
        .not.toContain(owner);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

});
