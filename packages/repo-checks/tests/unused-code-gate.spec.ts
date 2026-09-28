import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { REPO_ROOT } from '@abuddy/host/build/packages-built';

/**
 * The compiler reports unused code, in every package, and nothing has to opt in.
 *
 * `noUnusedLocals` catches a class the linter structurally cannot. Measured the day this landed: `oxlint`
 * reads 114 files in `@abuddy/ui` and reports zero, where `vue-tsc --noUnusedLocals` reports ten — it does
 * not analyse bindings inside an SFC's script block. Twenty-seven findings survived a fully green lint run,
 * in `.vue` scripts and in generated code, which is why this gate is the compiler's rather than the linter's.
 *
 * The gate decays the way lint coverage did — silently, one new package at a time — so the flag is checked
 * rather than trusted. Two halves, because there are two ways to have no gate: a config that omits the flag,
 * and a package whose source no config compiles.
 *
 * The option is read *effective* rather than literal, through the same parser `tsc` uses. That matters
 * twice: these configs carry `//` comments, which `JSON.parse` rejects, and several inherit the flag rather
 * than spelling it — `packages/api`'s `tsconfig.test.json` and `tsconfig.scripts.json` extend its
 * `tsconfig.json`, and the renderer's `tsconfig.vitest.json` extends its `tsconfig.app.json`.
 */

const packageDirs = (): string[] =>
  fs.readdirSync(path.join(REPO_ROOT, 'packages'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(REPO_ROOT, 'packages', entry.name, 'package.json')))
    .map((entry) => entry.name)
    .sort();

/**
 * A workspace with no tsconfig, and why it needs none. An entry is a claim that nothing here is compiled,
 * which is a strong claim, so it carries its reason and is reported when it stops applying.
 */
const NO_TSCONFIG: Record<string, string> = {
  'electron-versions': 'three files, one of them a plain index.js that queries Electron\'s bundled versions. '
    + 'No TypeScript, and no scripts block at all',
  'typescript-floor': 'a package.json and a CLAUDE.md. It exists only to install the oldest TypeScript the '
    + 'published packages support, so the CLI suite can compile a pack against it',
};

/** Every config that decides how a workspace is compiled: its own, and the ones a solution config references */
const configsOf = (workspace: string): string[] => {
  const root = path.join(REPO_ROOT, 'packages', workspace, 'tsconfig.json');
  if (!fs.existsSync(root)) return [];
  const read = ts.readConfigFile(root, ts.sys.readFile);
  const referenced = ((read.config as { references?: { path: string }[] }).references ?? [])
    .map((reference) => path.resolve(path.dirname(root), reference.path))
    .filter((file) => fs.existsSync(file));
  // A solution config compiles nothing itself — `files: []` with references is the renderer's shape — so
  // asserting the flag on it would be asserting it on a config no source passes through
  return referenced.length > 0 ? referenced : [root];
};

const setsTheFlag = (config: string): boolean => {
  const read = ts.readConfigFile(config, ts.sys.readFile);
  return ts.parseJsonConfigFileContent(read.config, ts.sys, path.dirname(config)).options.noUnusedLocals === true;
};

const hasTypeScript = (workspace: string): boolean => {
  const src = path.join(REPO_ROOT, 'packages', workspace, 'src');
  const walk = (dir: string): boolean => fs.readdirSync(dir, { withFileTypes: true }).some((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : /\.(ts|tsx|vue)$/.test(entry.name);
  });
  return fs.existsSync(src) && walk(src);
};

describe('every workspace is checked for unused code', () => {
  it('sets noUnusedLocals in every config that compiles source', () => {
    const configs = packageDirs().flatMap(configsOf);
    expect(configs.length, 'no tsconfig was derived, so this would pass over nothing').toBeGreaterThan(10);
    const missing = configs.filter((config) => !setsTheFlag(config)).map((config) => path.relative(REPO_ROOT, config));
    expect(missing, 'add "noUnusedLocals": true to these: a package without it is one the compiler stops '
      + 'reporting dead code in, and nothing else reports the kind it finds').toEqual([]);
  });

  // Otherwise the flag above is dodged by having no config at all, which reads the same as passing
  it('leaves no package with TypeScript and no config to compile it', () => {
    const unconfigured = packageDirs()
      .filter((workspace) => configsOf(workspace).length === 0)
      .filter((workspace) => !(workspace in NO_TSCONFIG));
    expect(unconfigured, 'give these a tsconfig.json, or add them to NO_TSCONFIG with a reason').toEqual([]);
    const claimed = Object.keys(NO_TSCONFIG).filter(hasTypeScript);
    expect(claimed, 'these are listed as having nothing to compile and do have TypeScript in src/').toEqual([]);
  });

  // A list of exceptions is only honest while each one is still an exception
  it('lists no exception that has stopped applying', () => {
    const stale = Object.keys(NO_TSCONFIG)
      .filter((workspace) => !packageDirs().includes(workspace) || configsOf(workspace).length > 0);
    expect(stale, 'these are gone or now have a tsconfig; drop them from NO_TSCONFIG').toEqual([]);
  });

  // The check reads a parsed config, so a config missing the flag is a thing this spec can construct —
  // which is the difference between a gate that has been watched failing and one that never has
  it('reports a config that does not set it', () => {
    const real = path.join(REPO_ROOT, 'packages', 'abuddy-host', 'tsconfig.json');
    const read = ts.readConfigFile(real, ts.sys.readFile);
    const options = (read.config as { compilerOptions: Record<string, unknown> }).compilerOptions;
    expect(options.noUnusedLocals, 'the file this mutates has stopped setting the flag literally').toBe(true);
    delete options.noUnusedLocals;
    const without = ts.parseJsonConfigFileContent(read.config, ts.sys, path.dirname(real));
    expect(without.options.noUnusedLocals, 'dropping the flag has to change the answer, or the check above '
      + 'reads something other than the flag').not.toBe(true);
  });
});
