import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '@abuddy/host/build/packages-built';
import { population } from '@abuddy/sdk/testing';
import { DIR_BY_PACKAGE } from '../../../scripts/lib/workspace-deps.ts';
import { FIXTURE_PACKAGE, handWrittenManifests, importsFixture, packagesUsingFixtures, PACK_FIXTURE, testFilesPoliced } from '../../../scripts/lib/pack-materialisation.ts';

/**
 * One place decides what a pack on disk looks like, and this is the check that it stays one.
 *
 * `packFixture` exists because a fixture too thin for a rule to fire is a case that passes because it could
 * not fail — measured: half of `import-specifiers.integration`'s sweep once ran on a fixture where two of its
 * rules could not speak. That holds only while specs *ask* for a pack instead of assembling one.
 *
 * **The success case here is `[]`, which cannot tell "nothing offends" from "the detector broke".** So the
 * population is asserted, the predicate is exercised on the code it was written against, and both kinds of
 * thing it must leave alone are asserted too — a rule that passed by flagging everything would fail those.
 */
describe('a pack on disk is asked for, not assembled', () => {
  it('reads the packages whose tests import the fixture, and some do', () => {
    const packages = population(`packages importing ${PACK_FIXTURE}`, packagesUsingFixtures());
    expect(packages, 'no package imports the fixture, so this rule reads nothing').not.toEqual([]);
    expect(population('test files policed', testFilesPoliced()).length,
      'the policed packages hold no test files, so the sweep below looks at nothing').toBeGreaterThan(20);
  });

  it('finds no test building a pack manifest by hand', () => {
    const offences = testFilesPoliced().flatMap((file) =>
      handWrittenManifests(fs.readFileSync(path.join(REPO_ROOT, file), 'utf-8'), file));
    expect(offences.map(({ file, line }) => `${file}:${line}`),
      `these build a manifest inline; ask ${PACK_FIXTURE} for the pack instead`).toEqual([]);
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

  /**
   * The predicate, on the code it was written against.
   *
   * Taken from `clear-build-output.spec.ts` as it stood before the conversion, which is the firing case a
   * synthetic one only approximates: a `package.json` and a manifest written side by side into a directory
   * the spec already made. Both spellings of the import are here because the names are read from it — a file
   * reaching `fs.writeFileSync` through a namespace and one destructuring `writeFileSync` are the same
   * finding, and a check that hard-coded either would miss half the tree.
   */
  const BEFORE_CONVERSION = `
    import * as fs from 'node:fs';
    import * as path from 'node:path';
    it('a case', () => {
      fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'built-in-pack', type: 'module' }));
      fs.writeFileSync(path.join(root, 'abuddy.json'), JSON.stringify({
        id: 'built-in-pack', name: 'Built-in', version: '1.0.0', builtIn: true,
      }));
    });`;

  it('flags a manifest built inline, however the write is spelled', () => {
    expect(handWrittenManifests(BEFORE_CONVERSION, 'before.spec.ts').map(({ line }) => line)).toEqual([6]);
    const destructured = BEFORE_CONVERSION
      .replace("import * as fs from 'node:fs';", "import { writeFileSync } from 'node:fs';")
      .replaceAll('fs.writeFileSync', 'writeFileSync');
    expect(handWrittenManifests(destructured, 'before.spec.ts'), 'the names are read from the import')
      .toHaveLength(1);
  });

  /**
   * And the four shapes it must leave alone, which are why the rule is not "no test writes `abuddy.json`".
   *
   * Each is a real site left unconverted on purpose (`packages/abuddy-sdk/CLAUDE.md` records them): a
   * directory holding *any* manifest is sometimes the subject; a pack something else scaffolded is patched
   * rather than built; a manifest handed to a command under test has no tree around it; and the installed
   * shape belongs to `@abuddy/host`. A detector that flagged these would be answered by exemptions, and an
   * exemption list is what this is built to avoid.
   */
  it.each([
    ['a discovery marker', "fs.writeFileSync(path.join(tree, name, 'abuddy.json'), '{}');"],
    ['a patch of a pack already there', "fs.writeFileSync(path.join(pack, 'abuddy.json'), JSON.stringify(manifest, null, 2));"],
    ['a manifest handed in', 'function writeManifest(dir, manifest) { fs.writeFileSync(path.join(dir, "abuddy.json"), JSON.stringify(manifest)); }'],
    ['the fixture itself', "const dir = packFixture({ manifest: { id: 'x' } });"],
  ])('leaves %s alone', (_what, line) => {
    expect(handWrittenManifests(`import * as fs from 'node:fs';\n${line}`, 'allowed.spec.ts')).toEqual([]);
  });

  it('reads nothing from a file that never imported fs', () => {
    expect(handWrittenManifests("writeFileSync('abuddy.json', JSON.stringify({ id: 'x' }));", 'no-import.spec.ts'))
      .toEqual([]);
  });
});
