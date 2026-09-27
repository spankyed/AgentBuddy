/**
 * The rule: an own-module specifier a pack wrote, and the file it should have named.
 *
 * A pack names its own modules two ways — the `#` subpath imports in its `package.json`, and a relative path
 * to a sibling — and either names the file that is there: `#generated/services.ts`, not
 * `#generated/services`; `./contract.ts`, not `./contract`.
 *
 * **No runtime resolves an extensionless specifier in ESM.** Node's resolver does no extension guessing and
 * no directory-index resolution, deliberately, and esbuild follows it — given a pack's mapping it finds the
 * target and then refuses the path, naming the file it wanted. So an extensionless `#` import works only
 * while a build guesses the suffix, and this one stopped guessing
 * (`docs/archive/goals/goal-pack-imports-name-the-file.md`): one convention for hand-written code, generated
 * code and the scaffold, where there were three.
 *
 * The extension is `.ts` rather than `.js` because that is the file that exists: a pack is bundled rather
 * than emitted as individual modules, its tsconfig sets `allowImportingTsExtensions`, and `tsc`, `vue-tsc`,
 * Vite and esbuild all resolve it. The `@abuddy` packages have named their `.ts` sources for as long
 * (`check:specifiers`, `findJsSpecifiers`).
 *
 * **The rule is here; finding the specifiers is the caller's.** `npm run check:specifiers` applies this to
 * the packs in this checkout and `abuddy build` to every pack outside it, and each already parses a pack's
 * sources for other rules — so each hands its specifiers over and neither reimplements the rule. It was
 * briefly the other way round, with a regex and a hand-written comment stripper in here: that reported a
 * commented-out import as a real one whenever a regex literal earlier in the file held an unbalanced quote,
 * and read no `vi.mock('./x')` at all. A syntax tree has neither problem, and both callers had one already.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { readSubpathImports } from './subpath-imports.ts';

/**
 * The extensions a pack's module may have, source first, and the only place left that looks for one.
 *
 * This is a diagnostic, not a resolver: nothing resolves an extensionless specifier any more, and the search
 * is here so the message can name the file the author meant instead of leaving them a bundler's error.
 * `.vue` is in the list for the same reason — Vite's default extensions leave it out, so an extensionless SFC
 * import never resolved anywhere, and naming it is more use than passing over it. `.json` is last, so a
 * `data.ts` beside a `data.json` wins: naming the file is right for every bundler in a pack's toolchain, and
 * what Node additionally wants for JSON — an import attribute — is past what this rule is about.
 */
const MODULE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.vue', '.js', '.mjs', '.cjs', '.json'];

/** `statSync` rather than `existsSync`, which is true of a directory */
const isFile = (target: string): boolean => {
  try {
    return fs.statSync(target).isFile();
  } catch {
    return false;
  }
};

/** `<dir>/events` -> `<dir>/events.ts`, and `<dir>/repository` -> `<dir>/repository/index.ts` */
function fileAt(base: string): string | undefined {
  if (isFile(base)) return base;
  for (const ext of MODULE_EXTENSIONS) if (isFile(base + ext)) return base + ext;
  for (const ext of MODULE_EXTENSIONS) {
    const index = path.join(base, `index${ext}`);
    if (isFile(index)) return index;
  }
  return undefined;
}

/** One specifier a pack's source names, as the caller's reader found it: the file is relative to the pack */
export interface OwnModuleSpecifier {
  file: string;
  line: number;
  specifier: string;
  /**
   * Where the specifier's text sits in the file on disk, inside the quotes — a rewriter's splice point.
   *
   * Optional because this rule does not read them: it reports, and `specifiers:fix` is what splices. A reader
   * that stops filling them is caught by a test rather than by the type, since the host's own spec passes
   * hand-written findings with no position at all.
   */
  start?: number;
  end?: number;
}

/**
 * `file:line: specifier -> what it should say`, one per specifier in `found` that names no file.
 *
 * Every specifier a reader found may be passed, `@abuddy/sdk` and `vue` included: what counts as one of the
 * pack's own modules is this rule's to know, not the reader's.
 *
 * Two forms fail the same way and get the same message: nothing (`#generated/events`), and the emitted
 * extension of a TypeScript module (`#generated/events.js`), which names a file a pack never produces — a
 * pack ships one bundle, not a module per source file.
 *
 * A specifier that resolves to nothing is left alone rather than reported. Only the pack's declared patterns
 * are considered for a `#` name, so a hex colour (`'#3B82F6'`) is not a specifier, and a name pointing at a
 * file that does not exist is a resolution error the bundler reports with more context than this could.
 */
export function ownModuleProblems(packDir: string, found: Iterable<OwnModuleSpecifier>): string[] {
  return ownModuleFindings(packDir, found)
    .map(({ file, line, specifier, named }) => `${file}:${line}: '${specifier}' names no file — write '${named}'`);
}

/** One specifier that names no file, and the file it should have named */
export interface OwnModuleFinding extends OwnModuleSpecifier {
  /** What to write instead. Its presence is what makes a finding fixable, which `specifiers:fix` reads. */
  readonly named: string;
}

/**
 * The same findings as `ownModuleProblems`, before they become sentences.
 *
 * Two readers of one rule: the message, and `npm run specifiers:fix`, which splices `named` over the
 * specifier's span. They must agree about what is fixable, so "fixable" is not a second judgement — it is
 * whether this returned the finding at all.
 */
export function ownModuleFindings(packDir: string, found: Iterable<OwnModuleSpecifier>): OwnModuleFinding[] {
  const imports = readSubpathImports(packDir);
  const findings: OwnModuleFinding[] = [];
  for (const specifier of found) {
    const named = specifier.specifier.startsWith('#')
      ? namedFileFor(packDir, imports, specifier.specifier)
      : /^\.{1,2}\//.test(specifier.specifier)
        ? namedFileAt(path.resolve(packDir, path.dirname(specifier.file), specifier.specifier), specifier.specifier)
        : undefined;
    if (named !== undefined) findings.push({ ...specifier, named });
  }
  return findings;
}

/** A module extension at the end of a path, which the search below replaces with the one that is there */
const TRAILING_EXTENSION = new RegExp(`(${MODULE_EXTENSIONS.join('|')})$`.replace(/\./g, '\\.'));

/**
 * The path a pack's `imports` map sends a `#` specifier to, or undefined when the map doesn't cover it.
 *
 * Node's precedence, not the manifest's key order: an exact entry first, then the *longest* matching wildcard.
 * Taking them in key order named the wrong file for a pack declaring both `#gen/*` and `#gen/deep/*`, advice
 * that would not have resolved either.
 *
 * The path the mapping names, which need not be a file: `namedFileFor` below turns it into advice about the file
 * that *is* there, and `findContractLeafImports` resolves it to a source file to walk. Both need the mapping
 * before they can do either, and one owner for the precedence is the reason this is separate.
 */
export function mappedPathFor(packDir: string, imports: Record<string, string>, specifier: string): string | undefined {
  const exact = imports[specifier];
  if (exact !== undefined) return path.resolve(packDir, exact);
  const wildcards = Object.entries(imports).filter(([pattern, target]) => pattern.endsWith('/*') && target.endsWith('/*'))
    .sort(([a], [b]) => b.length - a.length);
  for (const [pattern, target] of wildcards) {
    const prefix = pattern.slice(0, -1);
    if (specifier.startsWith(prefix)) return path.resolve(packDir, target.slice(0, -1) + specifier.slice(prefix.length));
  }
  return undefined;
}

/**
 * The path a pack-internal specifier names, by the two spellings a pack may write: a relative path, or one of its
 * own `#` subpaths, mapped through `mappedPathFor` — the one owner of Node's precedence for an `imports` map.
 *
 * `@/` is not one of them, and this is the one place that is decided for every caller. It is a TypeScript-only
 * `paths` mapping no runtime reads: `findPackOwnAliases` fails `check:specifiers` on one in any pack source or test
 * and the CLI's `pack-own-aliases` refuses it unswitchably, so every own-module specifier a pack writes is a `#`
 * subpath. Resolving `@/` here bought nothing and cost the rest — both rules read it and skipped the spelling the
 * packs use, and their fixtures were written in it, so both were blind with every test green.
 *
 * It answers with a path and does not ask whether the file is there: a caller that reads the target pairs this
 * with its own existence check (`check-import-specifiers.ts`'s `sourceFile` does), and a caller that only asks
 * where a specifier points needs none.
 */
export function packTargetOf(packDir: string, imports: Record<string, string>, from: string, specifier: string): string | undefined {
  if (specifier.startsWith('.')) return path.resolve(path.dirname(from), specifier);
  return specifier.startsWith('#') ? mappedPathFor(packDir, imports, specifier) : undefined;
}

/**
 * What a `#` specifier should have said, or undefined when it already names a file, or names nothing this
 * pack declares.
 */
export function namedFileFor(packDir: string, imports: Record<string, string>, specifier: string): string | undefined {
  // An exact entry names one file outright, so there is nothing to rewrite; only a wildcard can lose an extension
  if (imports[specifier] !== undefined) return undefined;
  const mapped = mappedPathFor(packDir, imports, specifier);
  return mapped === undefined ? undefined : namedFileAt(mapped, specifier);
}

/**
 * The specifier rewritten to name the file `mapped` stands for, or undefined when it already does or when
 * nothing is there. A specifier that resolves to nothing is the bundler's to report, with more context than
 * this has.
 */
function namedFileAt(mapped: string, specifier: string): string | undefined {
  if (isFile(mapped)) return undefined;
  const base = mapped.replace(TRAILING_EXTENSION, '');
  const resolved = fileAt(base);
  if (resolved === undefined) return undefined;
  return specifier.replace(TRAILING_EXTENSION, '') + resolved.slice(base.length).split(path.sep).join('/');
}
