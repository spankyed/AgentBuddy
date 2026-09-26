/**
 * A pack's own-module specifiers that name no file, and what they should have said.
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
 * One implementation, two callers, because the rule is the same rule: `npm run check:specifiers` applies it
 * to the packs in this checkout, and `abuddy build` to every pack outside it. The two copies of a tsconfig
 * reader that drifted apart are why this is not written twice.
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
 * import never resolved anywhere, and naming it is more use than passing over it.
 */
const MODULE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.vue', '.js', '.mjs', '.cjs'];

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

/** A pack's source: TypeScript and SFCs, whose `<script>` blocks import the same way. `.d.ts` declares, and imports nothing of the pack's. */
const SOURCE_FILE = /(?<!\.d)\.(ts|tsx|mts|cts)$|\.vue$/;
/** Every quoted `#…` in a file: a `#` string in a pack's source is a specifier, whatever syntax reaches it */
const SUBPATH_SPECIFIER = /(['"])(#[^'"\s]+)\1/g;
/**
 * A relative specifier, in import position only.
 *
 * `#` needs no context — nothing else in a pack's source starts a string that way — but `'./media'` is as
 * likely to be a path as a specifier, so this one reads the syntax around it.
 */
const RELATIVE_SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)(['"])(\.{1,2}\/[^'"]+)\1/g;

/**
 * The code with its comments blanked out, character for character, so an offset still points where it did.
 *
 * A commented-out import is not an import: five of them in default-setup name a module that has since moved
 * or gone, and a check that reported those would be asking for a comment to be kept resolvable. Blanking
 * rather than deleting keeps every line number and match index the same as in the file on disk.
 */
function withoutComments(code: string): string {
  const out = [...code];
  let i = 0;
  const blank = (from: number, to: number) => { for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' '; };
  while (i < code.length) {
    const two = code.slice(i, i + 2);
    if (two === '//') { const end = code.indexOf('\n', i); blank(i, end === -1 ? code.length : end); i = end === -1 ? code.length : end; continue; }
    if (two === '/*') { const end = code.indexOf('*/', i + 2); blank(i, end === -1 ? code.length : end + 2); i = end === -1 ? code.length : end + 2; continue; }
    const quote = code[i];
    if (quote === '"' || quote === "'" || quote === '`') {
      i += 1;
      while (i < code.length && code[i] !== quote) i += code[i] === '\\' ? 2 : 1;
      i += 1;
      continue;
    }
    i += 1;
  }
  return out.join('');
}

function* sourceFiles(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(full);
    else if (entry.isFile() && SOURCE_FILE.test(entry.name)) yield full;
  }
}

/**
 * `file:line: specifier -> what it should say`, one per own-module specifier that names no file.
 *
 * Two forms fail the same way and get the same message: nothing (`#generated/events`), and the emitted
 * extension of a TypeScript module (`#generated/events.js`), which names a file a pack never produces — a
 * pack ships one bundle, not a module per source file.
 *
 * Generated files are included: `abuddy generate-entries` writes them and writes extensions, so one that
 * lacks them means the pack was generated by an older CLI and `abuddy build` regenerates it anyway — saying
 * so is more use than skipping it.
 *
 * A `#` string that resolves to nothing is left alone rather than reported. Only the pack's declared
 * patterns are considered, so a hex colour (`'#3B82F6'`) is not a specifier, and a `#` name pointing at a
 * file that does not exist is a resolution error the bundler reports with more context than this could.
 */
export function ownModuleSpecifierProblems(packDir: string, dirs: readonly string[] = ['src']): string[] {
  const imports = readSubpathImports(packDir);
  if (Object.keys(imports).length === 0) return [];
  const problems: string[] = [];
  for (const dir of dirs) {
    const root = path.join(packDir, dir);
    if (!fs.existsSync(root)) continue;
    for (const file of sourceFiles(root)) {
      const code = withoutComments(fs.readFileSync(file, 'utf-8'));
      const where = path.relative(packDir, file).split(path.sep).join('/');
      for (const [regex, nameFor] of [
        [SUBPATH_SPECIFIER, (s: string) => fileNamedBy(packDir, imports, s)],
        [RELATIVE_SPECIFIER, (s: string) => fileNamedAt(path.resolve(path.dirname(file), s), s)],
      ] as const) {
        for (const match of code.matchAll(regex)) {
          const specifier = match[2] as string;
          const named = nameFor(specifier);
          if (named === undefined) continue;
          problems.push(`${where}:${code.slice(0, match.index).split('\n').length}: '${specifier}' names no file — write '${named}'`);
        }
      }
    }
  }
  return problems;
}

/** A module extension at the end of a path, which the search below replaces with the one that is there */
const TRAILING_EXTENSION = new RegExp(`(${MODULE_EXTENSIONS.join('|')})$`.replace(/\./g, '\\.'));

/**
 * What the specifier should have said, or undefined when it already names a file, or names nothing this pack
 * declares.
 *
 * Exact patterns first, as Node resolves them: an exact pattern's target is a file path in the manifest, so
 * whether it is there is the manifest's business rather than the specifier's.
 */
function fileNamedBy(packDir: string, imports: Record<string, string>, specifier: string): string | undefined {
  if (imports[specifier] !== undefined) return undefined;
  for (const [pattern, target] of Object.entries(imports)) {
    if (!pattern.endsWith('/*') || !target.endsWith('/*')) continue;
    const prefix = pattern.slice(0, -1);
    if (!specifier.startsWith(prefix)) continue;
    const named = fileNamedAt(path.resolve(packDir, target.slice(0, -1) + specifier.slice(prefix.length)), specifier);
    if (named !== undefined) return named;
  }
  return undefined;
}

/**
 * The specifier rewritten to name the file `mapped` stands for, or undefined when it already does or when
 * nothing is there. A specifier that resolves to nothing is the bundler's to report, with more context than
 * this has.
 */
function fileNamedAt(mapped: string, specifier: string): string | undefined {
  if (isFile(mapped)) return undefined;
  const base = mapped.replace(TRAILING_EXTENSION, '');
  const resolved = fileAt(base);
  if (resolved === undefined) return undefined;
  return specifier.replace(TRAILING_EXTENSION, '') + resolved.slice(base.length).split(path.sep).join('/');
}
