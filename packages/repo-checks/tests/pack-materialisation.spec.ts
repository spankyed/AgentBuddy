import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '@abuddy/host/build/packages-built';
import { population } from '@abuddy/sdk/testing';
import { handWrittenManifests, packagesUsingFixtures, PACK_FIXTURES, testFilesPoliced } from '../../../scripts/lib/pack-materialisation.ts';

/**
 * One place decides what a pack on disk looks like, and this is the check that it stays one.
 *
 * `@app/pack-fixtures` exists because a fixture too thin for a rule to fire is a case that passes because it
 * could not fail — measured: half of `import-specifiers.integration`'s sweep once ran on a fixture where two
 * of its rules could not speak. That holds only while specs *ask* for a pack instead of assembling one.
 *
 * **The success case here is `[]`, which cannot tell "nothing offends" from "the detector broke".** So the
 * population is asserted, the predicate is exercised on the code it was written against, and both kinds of
 * thing it must leave alone are asserted too — a rule that passed by flagging everything would fail those.
 */
describe('a pack on disk is asked for, not assembled', () => {
  it('reads the packages that declare the fixture, and some do', () => {
    const packages = population(`packages declaring ${PACK_FIXTURES}`, packagesUsingFixtures());
    expect(packages, 'no package declares the fixture, so this rule reads nothing').not.toEqual([]);
    expect(population('test files policed', testFilesPoliced()).length,
      'the policed packages hold no test files, so the sweep below looks at nothing').toBeGreaterThan(20);
  });

  it('finds no test building a pack manifest by hand', () => {
    const offences = testFilesPoliced().flatMap((file) =>
      handWrittenManifests(fs.readFileSync(path.join(REPO_ROOT, file), 'utf-8'), file));
    expect(offences.map(({ file, line }) => `${file}:${line}`),
      `these build a manifest inline; ask ${PACK_FIXTURES} for the pack instead`).toEqual([]);
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
   * Each is a real site left unconverted on purpose (`packages/pack-fixtures/CLAUDE.md` records them): a
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
