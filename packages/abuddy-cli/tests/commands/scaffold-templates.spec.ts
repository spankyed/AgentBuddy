// The scaffold's templates are files under `templates/`, and this is the check that the set of files and the
// set of `renderTemplate` calls are the same set. It replaces `findUnlistedPackTemplates`, which existed only
// because the templates were string literals and a hand-kept list said which files held them
// (`docs/goals/goal-one-rule-set.md`).
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderTemplate, templateFiles, templatesRoot } from '../../src/templates.ts';

const SRC = path.join(import.meta.dirname, '..', '..', 'src');

/** Every `renderTemplate('…')` literal in the CLI's source, with the file that names it */
function rendered(): { name: string; from: string }[] {
  const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
  return walk(SRC).filter((file) => file.endsWith('.ts')).flatMap((file) =>
    [...fs.readFileSync(file, 'utf-8').matchAll(/renderTemplate\(\s*'([^']+)'/g)]
      .map((match) => ({ name: match[1] as string, from: path.relative(SRC, file) })));
}

/**
 * What a template may be, if the CLI is to have it wherever it runs. Both of these were found by packaging the
 * app and listing what arrived, not by reading the config.
 */
describe('what the scaffold ships', () => {
  const REPO = path.join(import.meta.dirname, '..', '..', '..', '..');

  /**
   * electron-builder strips every `.d.ts` from the packaged app whatever its `files` array says — measured on a
   * `--dir` build: zero remain in app.asar. So a `.d.ts` template would be missing from the CLI the app
   * installs, and `abuddy init` would scaffold a pack without it. `init.ts` keeps that one as a string.
   */
  it('holds no .d.ts template, which the packaged app would drop', () => {
    expect(templateFiles().filter((file) => file.endsWith('.d.ts'))).toEqual([]);
  });

  /**
   * And the include that carries the rest: the same `files` array excludes `**` + `/*.ts`, so without a later
   * pattern naming the templates every `.ts` among them goes the same way.
   *
   * This asserts the include's position, which is what matters here. What that array *does* — which paths reach
   * the app — is `repo-checks/tests/packaged-app-files.spec.ts`, which runs electron-builder's own matcher over
   * it, this one included.
   */
  it('is included by electron-builder after the exclusions that would drop it', () => {
    const config = fs.readFileSync(path.join(REPO, 'electron-builder.mjs'), 'utf-8');
    const include = config.indexOf("'packages/abuddy-cli/dist/package/templates/**'");
    const exclude = config.indexOf("'!**/*.ts'");
    expect(include, 'electron-builder must name the templates, or the app installs a CLI that scaffolds nothing').toBeGreaterThan(-1);
    expect(include, 'last match wins, so the include has to come after the exclusion').toBeGreaterThan(exclude);
  });
});

describe('the scaffold templates', () => {
  /**
   * Both directions, which is what replaces the rule that used to check a hand-kept list of the files holding
   * template literals. Not "one caller each": `steps/register.ts` has two by design — `abuddy init` writes it
   * and `abuddy add step` writes it again when the pack has no step list yet.
   */
  it('are each rendered by a call site', () => {
    const calls = rendered();
    const unreferenced = templateFiles().filter((file) => !calls.some((call) => call.name === file));
    expect(unreferenced, 'a template nothing renders is dead weight the scaffold ships').toEqual([]);
  });

  it('are all there: every name a call site renders exists', () => {
    const missing = rendered().filter((call) => !fs.existsSync(path.join(templatesRoot(), call.name)));
    expect(missing.map((call) => `${call.from}: ${call.name}`)).toEqual([]);
  });

  /**
   * The renderer fails loudly in both directions, because the alternative is shipping `__PASCAL__` into
   * someone's pack, or silently dropping a value the caller meant to pass.
   */
  it('refuse a render with the wrong values', () => {
    const name = templateFiles()[0] as string;
    expect(() => renderTemplate(name, { NOT_A_PLACEHOLDER: 'x' }))
      .toThrow(/NOT_A_PLACEHOLDER was passed and the template does not use it/);
    expect(() => renderTemplate('pack/nothing-here.ts')).toThrow(/No template "pack\/nothing-here\.ts"/);
  });
});
