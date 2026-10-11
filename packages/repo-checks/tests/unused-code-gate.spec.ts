import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { REPO_ROOT } from '@apack/host/build/packages-built';
import { population } from '@apack/sdk/testing';
import { PACKAGE_DIRS } from '../../../scripts/lib/workspace-deps.ts';

/**
 * The compiler reports unused code, in every package, and nothing has to opt in.
 *
 * `noUnusedLocals` catches a class the linter structurally cannot. Measured the day this landed: `oxlint`
 * reads 114 files in `@apack/ui` and reports zero, where `vue-tsc --noUnusedLocals` reports ten — it does
 * not analyse bindings inside an SFC's script block. Twenty-seven findings survived a fully green lint run,
 * in `.vue` scripts and in generated code, which is why this gate is the compiler's rather than the linter's.
 *
 * The gate decays the way lint coverage did — silently, one new package at a time — so the flag is checked
 * rather than trusted. Two halves, because there are two ways to have no gate: a config that omits the flag,
 * and a package whose source no config compiles.
 *
 * **Every tsconfig, not one per workspace.** A package's checks run through more configs than its
 * `tsconfig.json`: `typecheck:be` compiles `packages/api` through three, and the published packages build
 * through a `tsconfig.package.json`. All of those inherit the flag today, and a narrower population would
 * pass while one of them turned it off. What is excluded is derived rather than named — a config whose
 * parsed file list is empty compiles nothing, which is what a solution config like the renderer's root is.
 *
 * The option is read *effective* rather than literal, through the same parser `tsc` uses. That matters
 * twice: these configs carry `//` comments, which `JSON.parse` rejects, and most of them inherit the flag
 * through `extends` rather than spelling it.
 */

const packageDirs = (): string[] =>
  [...PACKAGE_DIRS];

/**
 * A config that compiles source and is still not gated, and why. API Extractor reads a package's built
 * declarations to produce its report; an unused local in that input is not a finding it should refuse to
 * run over, and `api:update` is not where dead code is meant to surface.
 */
const NOT_GATED: Record<string, string> = {
  'packages/apack-ears/tsconfig.api-extractor.json': 'API Extractor\'s input, not a check',
  'packages/apack-sdk/tsconfig.api-extractor.json': 'API Extractor\'s input, not a check',
  'packages/apack-ui/tsconfig.api-extractor.json': 'API Extractor\'s input, not a check',
};

interface Config { readonly rel: string; readonly file: string; readonly compiles: number; readonly gated: boolean }

const parse = (file: string): { compiles: number; gated: boolean } => {
  const read = ts.readConfigFile(file, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, path.dirname(file));
  return { compiles: parsed.fileNames.length, gated: parsed.options.noUnusedLocals === true };
};

const tsconfigsIn = (workspace: string): string[] => {
  const dir = path.join(REPO_ROOT, 'packages', workspace);
  return fs.readdirSync(dir).filter((file) => /^tsconfig.*\.json$/.test(file)).map((file) => path.join(dir, file)).sort();
};

/** Every tsconfig in the tree that compiles at least one file, so an empty solution config drops out on its own */
const compilingConfigs = (): Config[] => packageDirs()
  .flatMap(tsconfigsIn)
  .map((file) => ({ rel: path.relative(REPO_ROOT, file), file, ...parse(file) }))
  .filter((config) => config.compiles > 0);

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
    const configs = population('the tsconfigs that compile source', compilingConfigs(), { atLeast: 15 });
    const missing = configs.filter((config) => !config.gated && !(config.rel in NOT_GATED)).map((config) => config.rel);
    expect(missing, 'add "noUnusedLocals": true to these, or to NOT_GATED with a reason: a config without it '
      + 'is one the compiler stops reporting dead code through, and nothing else reports the kind it finds').toEqual([]);
  });

  // Otherwise the flag above is dodged by having no config at all, which reads the same as passing
  it('leaves no package with TypeScript and no config to compile it', () => {
    // Asked of the tree rather than read off a list. There was a `NO_TSCONFIG` here naming the two
    // workspaces that need none, and `hasTypeScript` — thirty lines up, and already run as this case's
    // second assertion — answers the same question exactly, so the list was a cached copy of its neighbour.
    const unconfigured = packageDirs()
      .filter((workspace) => tsconfigsIn(workspace).length === 0)
      .filter(hasTypeScript);
    expect(unconfigured, 'give these a tsconfig.json: a workspace with TypeScript and no config to compile '
      + 'it is one the unused-code flag above cannot reach').toEqual([]);
  });

  // A list of exceptions is only honest while each one is still an exception
  it('lists no exception that has stopped applying', () => {
    const compiling = new Set(compilingConfigs().map((config) => config.rel));
    const ungrounded = Object.keys(NOT_GATED).filter((rel) => !compiling.has(rel));
    expect(ungrounded, 'these are gone or no longer compile anything, so nothing exempts them; drop them '
      + 'from NOT_GATED').toEqual([]);
    const gatedAnyway = compilingConfigs().filter((config) => config.rel in NOT_GATED && config.gated).map((config) => config.rel);
    expect(gatedAnyway, 'these set the flag despite being listed as not gated; drop them from NOT_GATED').toEqual([]);
  });

  /**
   * Three ways this check could read something other than what it claims, each broken on purpose here. A
   * config missing the flag, a config inheriting it and a config compiling nothing are all things this can
   * construct from what it already parses, so each costs microseconds and runs every time.
   */
  describe('reads the flag rather than something that resembles it', () => {
    it('reports a config that drops the flag', () => {
      const real = path.join(REPO_ROOT, 'packages', 'apack-host', 'tsconfig.json');
      const read = ts.readConfigFile(real, ts.sys.readFile);
      const options = (read.config as { compilerOptions: Record<string, unknown> }).compilerOptions;
      expect(options.noUnusedLocals, 'the file this mutates has stopped setting the flag literally').toBe(true);
      delete options.noUnusedLocals;
      const without = ts.parseJsonConfigFileContent(read.config, ts.sys, path.dirname(real));
      expect(without.options.noUnusedLocals, 'dropping the flag has to change the answer').not.toBe(true);
    });

    // Most configs here inherit rather than spell it, and an inherited `false` is the way this decays
    // without anything being deleted
    it('follows extends, in both directions', () => {
      const base = path.join(REPO_ROOT, 'packages', 'api');
      const effective = (compilerOptions: Record<string, unknown>): boolean | undefined =>
        ts.parseJsonConfigFileContent({ extends: './tsconfig.json', compilerOptions }, ts.sys, base).options.noUnusedLocals;
      expect(effective({}), 'a config that only extends has to inherit the flag, or the population above is '
        + 'being read as ungated wherever it is inherited').toBe(true);
      expect(effective({ noUnusedLocals: false }), 'an override has to win, or turning the gate off in a '
        + 'child config would read as on').toBe(false);
    });

    // The one config excluded from the population is excluded for what it compiles, not for its name
    it('excludes a config that compiles nothing, and only that', () => {
      const empty = packageDirs().flatMap(tsconfigsIn)
        .map((file) => ({ rel: path.relative(REPO_ROOT, file), ...parse(file) }))
        .filter((config) => config.compiles === 0);
      expect(empty.map((config) => config.rel), 'the only config compiling nothing should be the renderer\'s '
        + 'solution config; another one here is a config whose include has stopped matching').toEqual(['packages/renderer/tsconfig.json']);
      expect(empty[0]!.gated, 'if the solution config ever sets the flag this exclusion stops being free, '
        + 'because it would then be the one place the answer came from').toBe(false);
    });
  });
});
