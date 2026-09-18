// Repo-wide import rules. The `checks` table at the bottom pairs each `find*` with the rule it enforces.
//
//   tsx scripts/check-import-specifiers.ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';
import { parse as parseSfc } from '@vue/compiler-sfc';
import { SHARED_INSTANCE_PACKAGES } from '@abuddy/host/build/shared-deps';

const repoRoot = path.resolve(import.meta.dirname, '..');
const CHECKED_DIRS = [
  'packages/abuddy-ears/src', 'packages/abuddy-ears/tests',
  'packages/abuddy-sdk/src', 'packages/abuddy-sdk/tests', 'packages/abuddy-sdk/scripts',
  'packages/abuddy-host/src', 'packages/abuddy-host/tests',
  'packages/abuddy-ui/src', 'packages/abuddy-ui/scripts',
];

/** Emitted extension → the source extensions that compile to it */
const SOURCE_EXTENSIONS: Record<string, string[]> = { '.js': ['.ts', '.tsx'], '.mjs': ['.mts'], '.cjs': ['.cts'] };
/** Calls whose first argument is a module path */
const MODULE_PATH_CALLS = /^(require|require\.resolve|(vi|jest)\.(mock|doMock|unmock|importActual|importMock))$/;

function* sourceFiles(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(full);
    else if (entry.isFile() && /(?<!\.d)\.(ts|tsx|mts|cts)$|\.vue$/.test(entry.name)) yield full;
  }
}

function parse(code: string, fileName: string): ts.SourceFile {
  const kind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, kind);
}

/** A file's code: the whole file, or a .vue file's <script> blocks with the line each starts on (less one) */
function codeBlocks(file: string): { content: string; lineOffset: number }[] {
  const code = fs.readFileSync(file, 'utf-8');
  if (!file.endsWith('.vue')) return [{ content: code, lineOffset: 0 }];
  const { descriptor } = parseSfc(code, { filename: file });
  return [descriptor.script, descriptor.scriptSetup].filter((b) => b !== null)
    .map((b) => ({ content: b.content, lineOffset: b.loc.start.line - 1 }));
}

/** Specifiers in a module (relative ones only unless `all`): every static and dynamic form that names a module path */
function specifiers(code: string, fileName: string, all = false): { text: string; line: number }[] {
  const source = parse(code, fileName);
  const found: { text: string; line: number }[] = [];
  const visit = (node: ts.Node) => {
    let literal: ts.StringLiteralLike | undefined;
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) literal = node.moduleSpecifier;
    else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && ts.isStringLiteral(node.moduleReference.expression)) literal = node.moduleReference.expression;
    else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) literal = node.argument.literal;
    else if (ts.isCallExpression(node) && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])
      && (node.expression.kind === ts.SyntaxKind.ImportKeyword || MODULE_PATH_CALLS.test(node.expression.getText(source)))) {
      literal = node.arguments[0];
    }
    if (literal && (all || /^\.\.?\//.test(literal.text))) {
      found.push({ text: literal.text, line: source.getLineAndCharacterOfPosition(literal.getStart(source)).line + 1 });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** `file:line: specifier` for each specifier in `files` that `matches` (relative ones only unless `all`) */
function findSpecifiers(files: string[], root: string, matches: (text: string, file: string) => boolean, all = true): string[] {
  const problems: string[] = [];
  for (const file of files) {
    for (const { content, lineOffset } of codeBlocks(file)) {
      for (const { text, line } of specifiers(content, file, all)) {
        if (matches(text, file)) problems.push(`${path.relative(root, file)}:${line + lineOffset}: ${text}`);
      }
    }
  }
  return problems;
}

/**
 * `file:line: specifier` for each relative emitted-extension specifier that names a TypeScript module.
 * An import of hand-written declarations (`./speech-event.js` → speech-event.d.ts) has no source and is fine.
 */
export function findJsSpecifiers(dirs = CHECKED_DIRS, root = repoRoot): string[] {
  const files = dirs.flatMap((dir) => {
    // A listed directory that is gone means the list is stale and something is no longer checked,
    // which is worth failing over — but say so, rather than letting a readdir ENOENT stack out
    if (!fs.existsSync(path.join(root, dir))) throw new Error(`${dir} is listed in CHECKED_DIRS and does not exist: remove it, or restore the directory`);
    return [...sourceFiles(path.join(root, dir))];
  });
  return findSpecifiers(files, root, (text, file) => {
    const emitted = path.extname(text);
    const base = path.resolve(path.dirname(file), text.slice(0, -emitted.length));
    return (SOURCE_EXTENSIONS[emitted] ?? []).some((ext) => fs.existsSync(`${base}${ext}`));
  }, false);
}

/** CLI sources whose template strings are the pack source `abuddy init` and `abuddy add` write */
const CLI_TEMPLATE_SOURCES = ['packages/abuddy-cli/src/commands/add', 'packages/abuddy-cli/src/commands/init.ts'];

/** Pack sources (each a pack's `src` root) and the pack templates the CLI writes, which use the generated facades */
const PACK_SOURCE_DIRS = [
  'packages/default-setup/src', 'tests/fixtures/external-pack/src', 'tests/fixtures/bundled-ui-pack/src',
  ...CLI_TEMPLATE_SOURCES,
];

/** The source files under each of `dirs` (a directory or a single file) */
function packFiles(dirs: string[], root: string): string[] {
  return dirs.flatMap((dir) => {
    const full = path.join(root, dir);
    if (!fs.existsSync(full)) return [];
    return fs.statSync(full).isFile() ? [full] : [...sourceFiles(full)];
  });
}

/** Any module specifier, including ones inside comments and strings */
const ANY_SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g;

/** `file:line: specifier` for each specifier in `files` that `matches`, read as text so template strings count too */
function findSpecifierText(files: string[], root: string, matches: (specifier: string) => boolean): string[] {
  return files.flatMap((file) => {
    const code = fs.readFileSync(file, 'utf-8');
    return [...code.matchAll(ANY_SPECIFIER)].filter((match) => matches(match[1]))
      .map((match) => `${path.relative(root, file)}:${code.slice(0, match.index).split('\n').length}: ${match[1]}`);
  });
}

type Rule = (node: ts.Node) => string[] | undefined;

/** The module a static import or export, or a dynamic import(), names */
function moduleOf(node: ts.Node): string | undefined {
  const literal = ts.isImportDeclaration(node) || ts.isExportDeclaration(node) ? node.moduleSpecifier
    : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword ? node.arguments[0] : undefined;
  return literal && ts.isStringLiteralLike(literal) ? literal.text : undefined;
}

/** A template literal's text as code. `${…}` and the escapes are blanked or unescaped in place, so lines and columns stay put. */
function templateCode(node: ts.TemplateLiteral, source: ts.SourceFile): string {
  const start = node.getStart(source);
  const chars = source.text.slice(start + 1, node.end - 1).split('');
  if (ts.isTemplateExpression(node)) {
    for (const span of node.templateSpans) {
      // From the `${` that opens the span to its closing `}`
      for (let i = span.pos - 2; i <= span.literal.getStart(source); i++) {
        if (chars[i - start - 1] !== '\n') chars[i - start - 1] = '_';
      }
    }
  }
  return chars.join('').replace(/\\([`$\\])/g, ' $1');
}

/**
 * `file:line: what` for each finding of `rule` in `files`. A syntax tree leaves out comments and string
 * text; a .vue file is read in its <script> blocks, and in the CLI's template sources the template
 * literals are pack code, so they are scanned as such.
 */
function findInFiles(files: string[], root: string, rule: Rule): string[] {
  return files.flatMap((file) => {
    const relative = path.relative(root, file).split(path.sep).join('/');
    const isTemplateSource = CLI_TEMPLATE_SOURCES.some((dir) => relative === dir || relative.startsWith(`${dir}/`));
    const found: { line: number; what: string }[] = [];
    const scan = (code: string, lineOffset: number, templates: boolean): void => {
      const source = parse(code, file);
      const lineOf = (node: ts.Node) => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 + lineOffset;
      const visit = (node: ts.Node): void => {
        for (const what of rule(node) ?? []) found.push({ line: lineOf(node), what });
        if (templates && (ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node))) {
          scan(templateCode(node, source), lineOf(node) - 1, false);
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    };
    for (const { content, lineOffset } of codeBlocks(file)) scan(content, lineOffset, isTemplateSource);
    return found.sort((a, b) => a.line - b.line).map(({ line, what }) => `${relative}:${line}: ${what}`);
  });
}

/** Sends packs get typed from #generated/events, whichever SDK module exports them untyped */
const EVENT_SENDS = ['emit', 'sendToPlugin', 'sendToSystem'];

/** Imports and re-exports of the untyped sends (and the engine's repository registration), or all of @abuddy/sdk/events */
const rawPackHelper: Rule = (node) => {
  if (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) return;
  const module = moduleOf(node);
  if (!module?.startsWith('@abuddy/')) return;
  const bindings = ts.isImportDeclaration(node) ? node.importClause?.namedBindings : node.exportClause;
  if (!bindings || ts.isNamespaceImport(bindings) || ts.isNamespaceExport(bindings)) {
    // `import * as x from`, `export * from`, `export * as x from` (a default import has no bindings)
    const namespace = bindings !== undefined || ts.isExportDeclaration(node);
    return namespace && module === '@abuddy/sdk/events' ? ['* from @abuddy/sdk/events (import the names)'] : undefined;
  }
  const raw = module === '@abuddy/ears' ? [...EVENT_SENDS, 'registerRepository', 'unregisterRepository'] : EVENT_SENDS;
  return bindings.elements.map((el) => (el.propertyName ?? el.name).text).filter((name) => raw.includes(name))
    .map((name) => `${name} from ${module}`);
};

/** `file:line: name from module` for each untyped send or repository registration a pack source names. Generated files are exempt. */
export function findRawPackHelpers(dirs = PACK_SOURCE_DIRS, root = repoRoot): string[] {
  const files = packFiles(dirs, root).filter((file) => !file.split(path.sep).includes('__generated__'));
  return findInFiles(files, root, rawPackHelper);
}

/**
 * `file:line: specifier` for each `@abuddy/host` module a pack source loads. The host package is
 * private to the app; packs use @abuddy/sdk (`services.appData`, `services.traceStore`, …).
 */
export function findHostImports(dirs = PACK_SOURCE_DIRS, root = repoRoot): string[] {
  return findSpecifierText(packFiles(dirs, root), root, (text) => /^@abuddy\/host(?:\/|$)/.test(text));
}

/** The host's raw event paths: `@abuddy/sdk/rpc` modules, `rootEvents` and `trpc.bus` */
const rawTransport: Rule = (node) => {
  const module = moduleOf(node);
  if (module && /^@abuddy\/sdk\/rpc(\/|$)/.test(module)) return [module];
  if (ts.isIdentifier(node) && node.text === 'rootEvents') return ['rootEvents'];
  if (ts.isPropertyAccessExpression(node) && node.name.text === 'bus' && ts.isIdentifier(node.expression) && node.expression.text === 'trpc') {
    return ['trpc.bus'];
  }
  return undefined;
};

/** `file:line: what` for each raw event path a pack source uses, which the typed sends in #generated/events replace */
export function findRawTransport(dirs = PACK_SOURCE_DIRS, root = repoRoot): string[] {
  return findInFiles(packFiles(dirs, root), root, rawTransport);
}

/** Pack backend code by path from the pack's `src` root, and the frontend code and tests among it */
const PACK_BACKEND_PATH = /^(features\/[^/]+\/be\/|features\/hooks\.ts$|migrations\/|extensions\/)/;
const PACK_FRONTEND_OR_TEST_PATH = /\.vue$|(^|\/)(fe|register-fe)\.ts$|^extensions\/(tiptap|artifacts\/viewers|blocks\/[^/]+)\/|(^|\/)__tests__\/|\.(spec|test)\.ts$/;

/** `console.x` and `console?.x` */
const consoleUse: Rule = (node) => {
  if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'console') {
    return [`console.${node.name.text}`];
  }
  return undefined;
};

/**
 * `file:line: console.<method>` for each console use in pack backend code, which logs with
 * `createLogger` from `@abuddy/sdk/logger`. Only pack `src` directories are checked: not the CLI's
 * template sources (their console output is the CLI's) or single files.
 */
export function findPackBackendConsole(dirs = PACK_SOURCE_DIRS, root = repoRoot): string[] {
  const files = dirs.filter((dir) => !CLI_TEMPLATE_SOURCES.includes(dir)).flatMap((dir) => {
    const full = path.join(root, dir);
    if (!fs.existsSync(full) || !fs.statSync(full).isDirectory()) return [];
    return [...sourceFiles(full)].filter((file) => {
      const relative = path.relative(full, file).split(path.sep).join('/');
      return PACK_BACKEND_PATH.test(relative) && !PACK_FRONTEND_OR_TEST_PATH.test(relative);
    });
  });
  return findInFiles(files, root, consoleUse);
}

/** Pack unit tests, which run on @abuddy/testing's harness: the pack's code and the SDK, not the app */
const PACK_TEST_DIRS = ['packages/default-setup/tests', 'tests/fixtures/external-pack/tests'];

/** API modules (its `@/` alias) and host, API or CLI sources by relative path */
const APP_SPECIFIER = /^(?:@abuddy\/host(?:\/|$)|@\/(?:core|setup)(?:\/|$)|(?:\.\.?\/)+(?:[\w.-]+\/)*(?:api|abuddy-host|abuddy-cli)\/src(?:\/|$))/;

/**
 * `file:line: specifier` for each app module a pack's unit tests load. Tests of app code belong to
 * that package; pack tests use @abuddy/sdk and @abuddy/testing.
 */
export function findAppImportsInPackTests(dirs = PACK_TEST_DIRS, root = repoRoot): string[] {
  return findSpecifierText(packFiles(dirs, root), root, (text) => APP_SPECIFIER.test(text));
}

/**
 * The layered packages, lowest first (docs/goals/goal-package-boundaries.md, Decision 1): the `@abuddy/*`
 * packages each may import, and path patterns it must never load.
 */
export const LAYERS: { name: string; dir: string; allowed: string[]; forbidden?: RegExp }[] = [
  { name: '@abuddy/ears', dir: 'packages/abuddy-ears', allowed: [] },
  { name: '@abuddy/sdk', dir: 'packages/abuddy-sdk', allowed: ['@abuddy/ears'] },
  {
    name: '@abuddy/host',
    dir: 'packages/abuddy-host',
    allowed: ['@abuddy/sdk', '@abuddy/ears'],
    // The API: its package, its `@/` alias, or its sources by relative path
    forbidden: /^(?:@app\/api(?:\/|$)|@\/|(?:\.\.?\/)+(?:[\w.-]+\/)*api\/(?:src|scripts)(?:\/|$))/,
  },
  { name: '@app/api', dir: 'packages/api', allowed: ['@abuddy/ears', '@abuddy/sdk', '@abuddy/host'] },
  { name: '@app/renderer', dir: 'packages/renderer', allowed: ['@abuddy/sdk', '@abuddy/host', '@abuddy/ui'] },
];

const abuddyPackage = (specifier: string) => specifier.match(/^@abuddy\/[^/]+/)?.[0];

const MANIFEST_FIELDS = ['dependencies', 'peerDependencies', 'optionalDependencies', 'devDependencies'];

/**
 * For each layered package, over its sources, tests and scripts: `file:line: specifier` for an import
 * it makes upward, `package.json: <field>: name` for an `@abuddy/*` dependency beyond the allowed
 * ones, and `package.json: undeclared: name` for an allowed one it imports without declaring.
 */
export function findUpwardImports(layers = LAYERS, root = repoRoot): string[] {
  const problems: string[] = [];
  for (const { name, dir, allowed, forbidden } of layers) {
    const permitted = new Set([name, ...allowed]);
    const imported = new Set<string>();
    const files = packFiles(['src', 'tests', 'scripts'].map((sub) => path.join(dir, sub)), root);
    problems.push(...findSpecifiers(files, root, (text) => {
      const pkg = abuddyPackage(text);
      if (pkg !== undefined && pkg !== name) imported.add(pkg);
      return (pkg !== undefined && !permitted.has(pkg)) || (forbidden?.test(text) ?? false);
    }));
    const manifestFile = path.join(root, dir, 'package.json');
    const manifest = readJsonFile<Record<string, Record<string, string> | undefined>>(manifestFile);
    const declared = new Set(MANIFEST_FIELDS.flatMap((field) => Object.keys(manifest[field] ?? {})));
    for (const field of MANIFEST_FIELDS) {
      for (const dep of Object.keys(manifest[field] ?? {})) {
        if (dep.startsWith('@abuddy/') && !permitted.has(dep)) problems.push(`${path.relative(root, manifestFile)}: ${field}: ${dep}`);
      }
    }
    for (const pkg of [...imported].sort()) {
      if (permitted.has(pkg) && !declared.has(pkg)) problems.push(`${path.relative(root, manifestFile)}: undeclared: ${pkg}`);
    }
  }
  return problems;
}

/**
 * Who may load LMDB (docs/goals/goal-package-boundaries.md, Decision 3): only `@abuddy/ears/lmdb` imports
 * `lmdb`. `dirs` may not import what `forbidden` matches; `except` is a directory inside them that may.
 */
export const LMDB_RULES: { dirs: string[]; except?: string; forbidden: RegExp }[] = [
  // The host and the API open the store through @abuddy/ears/lmdb
  {
    dirs: ['packages/abuddy-host/src', 'packages/abuddy-host/tests', 'packages/abuddy-host/scripts', 'packages/api/src', 'packages/api/tests', 'packages/api/scripts'],
    forbidden: /^lmdb(?:\/|$)/,
  },
  // The engine's root never loads the store
  { dirs: ['packages/abuddy-ears/src'], except: 'packages/abuddy-ears/src/lmdb', forbidden: /^(?:lmdb(?:\/|$)|(?:\.\.?\/)+(?:[\w.-]+\/)*lmdb(?:\/|$))/ },
  // Packs and their tests don't use the app's store
  { dirs: [...PACK_SOURCE_DIRS, ...PACK_TEST_DIRS], forbidden: /^(?:lmdb|@abuddy\/ears\/lmdb)(?:\/|$)/ },
];

/** `file:line: specifier` for each import of LMDB or the LMDB store where `rules` forbid it */
export function findLmdbImports(rules = LMDB_RULES, root = repoRoot): string[] {
  return rules.flatMap(({ dirs, except, forbidden }) => {
    const allowed = except && path.join(root, except) + path.sep;
    const files = packFiles(dirs, root).filter((file) => !allowed || !file.startsWith(allowed));
    return findSpecifiers(files, root, (text) => forbidden.test(text));
  });
}

/** The consumers of SHARED_INSTANCE_PACKAGES (@abuddy/host/build/shared-deps), which must not list the packages themselves */
export const SHARED_LIST_CONSUMERS = [
  'packages/abuddy-cli/src/build/be-bundler.ts',
  'packages/abuddy-cli/src/build/fe-bundler.ts',
  'packages/abuddy-cli/src/build/seed-runtime-check.ts',
  'packages/abuddy-host/src/packs/runtime/bridge.ts',
  'packages/abuddy-host/src/packs/module-bridge.ts',
  'packages/abuddy-testing/src/dependency-runtime.ts',
  'scripts/bundle-package.ts',
];

/**
 * `file:line: "text"` for each string in a consumer of the shared-instance list that names one of the
 * packages (`'@abuddy/sdk'`, `'@abuddy/ears/*'`) outside an import. Specific modules
 * (`'@abuddy/sdk/runtime'`) are fine: they aren't a list of what must be loaded once.
 */
export function findSharedPackageLists(files = SHARED_LIST_CONSUMERS, root = repoRoot, packages: readonly string[] = SHARED_INSTANCE_PACKAGES): string[] {
  const listed = new Set(packages.flatMap((pkg) => [pkg, `${pkg}/`, `${pkg}/*`]));
  const rule: Rule = (node) => {
    if (!ts.isStringLiteralLike(node) || !listed.has(node.text)) return undefined;
    const parent = node.parent;
    const isSpecifier = (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) && parent.moduleSpecifier === node;
    return isSpecifier || moduleOf(parent) === node.text ? undefined : [JSON.stringify(node.text)];
  };
  return findInFiles(files.map((file) => path.join(root, file)).filter((file) => fs.existsSync(file)), root, rule);
}

/** Every workspace package's src/ */
export function packageSourceDirs(root = repoRoot): string[] {
  return fs.readdirSync(path.join(root, 'packages'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(root, 'packages', entry.name, 'src')))
    .map((entry) => `packages/${entry.name}/src`);
}

/** The engine's repository registry, `repository` or `….repository`, through parentheses */
const isRepository = (node: ts.Expression): boolean => {
  const inner = ts.isParenthesizedExpression(node) ? node.expression : node;
  return (ts.isIdentifier(inner) && inner.text === 'repository')
    || (ts.isPropertyAccessExpression(inner) && inner.name.text === 'repository');
};

/** `repository as unknown as X`: reading repositories through a type the registering package doesn't declare */
const repositoryCast: Rule = (node) => {
  if (!ts.isAsExpression(node)) return;
  const inner = ts.isParenthesizedExpression(node.expression) ? node.expression.expression : node.expression;
  if (!ts.isAsExpression(inner) || inner.type.kind !== ts.SyntaxKind.UnknownKeyword || !isRepository(inner.expression)) return;
  return [node.getText()];
};

/**
 * `file:line: code` for each `repository as unknown as …` in `dirs`: each entity's repository lives
 * with the package that declares it, and other packages call it through its exports
 * (docs/goals/goal-package-boundaries.md, Decision 7), never through a cast of the engine's registry.
 */
export function findRepositoryCasts(dirs = packageSourceDirs(), root = repoRoot): string[] {
  return findInFiles(packFiles(dirs, root), root, repositoryCast);
}

/** The export condition under which @abuddy/* workspace packages resolve their TypeScript source */
export const SOURCE_CONDITION = '@abuddy/source';

/**
 * Config files that compile or bundle workspace source. A tsconfig separates its name with a dot or
 * a dash (`tsconfig.build.json`, `tsconfig-build.json`); a bundler config may carry a suffix on
 * either side of `config` (`vitest.node.config.ts`, `vite.config.prod.ts`, `rollup-defs.config.mjs`).
 */
const CONFIG_FILE = /^(?:tsconfig(?:[.-][\w.-]+)?\.json|(?:vite|vitest|tsup|tsdown|rollup|esbuild|build)(?:[.-][\w.-]+)?\.config(?:\.[\w.-]+)?\.[cm]?[jt]s)$/;
/** Directories that hold no workspace source: dependencies, build output and dot directories (worktrees, caches) */
const SKIPPED_DIRS = /^(?:node_modules|dist|out|coverage|\..+)$/;
/** Files a config compiles or bundles. Declarations included: tsc resolves their imports too */
const CODE_FILE = /\.(?:[cm]?[jt]sx?|vue)$/;
/** The extensions a relative config import may leave out */
const CONFIG_EXTENSIONS = ['', '.ts', '.mts', '.cts', '.js', '.mjs', '.cjs'];
/**
 * Vitest options that name files the config runs itself. A config with one of them compiles code of
 * its own, so its `projects` don't excuse it from declaring the condition.
 */
const TEST_FILE_OPTIONS = ['include', 'includeSource', 'dir', 'root', 'setupFiles', 'globalSetup', 'benchmark', 'typecheck'];

/**
 * Configs that resolve a built `dist` on purpose, with the reason. Every other config that compiles
 * or bundles code importing a source-condition package must declare the condition, so a new one
 * either declares it or is listed here.
 */
/**
 * Pack configs that declare the `@abuddy/source` condition on purpose, with the reason each does.
 *
 * The rule this excepts: a pack resolves the `@abuddy` packages' published `dist`, because that is the
 * one layout a pack author ever has. A pack config declaring the condition compiles against this
 * checkout's TypeScript source instead, so what it builds is something no pack author can reproduce.
 *
 * **Keep this table much smaller than `RESOLVES_DIST_BY_DESIGN`, and prefer moving the file to adding a
 * row.** The two are not mirror images. An exception there resolves `dist` — the layout every consumer
 * has — so a mistaken entry costs a stale build, which shows up as a type error or a missing symbol. An
 * exception here resolves source, so a mistaken entry costs a build that only exists in this checkout,
 * and nothing downstream notices: `types-bundler-determinism.spec.ts` compares a synthetic fixture pack
 * against the published tarballs, never the packs in this repository.
 *
 * Use it for:
 * - **a host-side config that physically sits in a pack's tree** and is consumed by a host build — a
 *   Vite config the renderer imports to build a built-in pack's frontend, say. It is host code by role
 *   and pack code only by location, so it declares the condition like every other host config. Moving it
 *   out of the pack tree is better wherever that is possible, and usually it is.
 * - **pack-local tooling that must read the packages' TypeScript source** rather than their built
 *   declarations: the mirror of the API Extractor entries above, which need the opposite for the same
 *   kind of reason.
 *
 * Do not use it for:
 * - **making a pack's own build or test run work.** That pack then builds unlike every pack author's
 *   build, which is the failure this rule exists to prevent, and no test compares the two. If a pack
 *   build needs source, the packages' `dist` is stale — run `npm run packages:ensure`.
 * - **a "canary" pack compiled against SDK source** to catch breaking changes early. It reports on a
 *   world no pack author lives in; `npm run typecheck:sdk` and the `api:check` reports already cover
 *   that surface, against the declarations packs actually get.
 *
 * An entry that excepts a pack's **build** owes a test that builds that pack both ways and compares the
 * output, as `types-bundler-determinism.spec.ts` does for its fixture. An entry for a host-side config
 * that merely sits in the tree owes nothing: it was never a pack build in the first place.
 */
export const DECLARES_SOURCE_BY_DESIGN = new Map<string, string>([
  // Empty on purpose. Every case so far has been better served by moving the file out of the pack tree.
]);

export const RESOLVES_DIST_BY_DESIGN = new Map<string, string>([
  // API Extractor reads the .d.ts rollup of a package's dependencies, so they must resolve to built
  // declarations; with the source condition tsc would analyse the dependency's .ts instead and report
  // diagnostics for source the report never covers.
  ['packages/abuddy-sdk/tsconfig.api-extractor.json', 'API Extractor analyses .d.ts: @abuddy/ears resolves to its built declarations'],
  ['packages/abuddy-ui/tsconfig.api-extractor.json', 'API Extractor analyses .d.ts: @abuddy/sdk resolves to its built declarations'],
  // tsdown keeps every dependency and peer external (deps.neverBundle), so it never resolves
  // @abuddy/sdk at all; vue-tsc emits the declarations under tsconfig.package.json, which declares it.
  ['packages/abuddy-ui/tsdown.config.ts', 'every @abuddy dependency stays external (deps.neverBundle), so nothing is resolved'],
]);

function conditionOption(file: string): string {
  const name = path.basename(file);
  if (name.endsWith('.json')) return 'compilerOptions.customConditions';
  return /^(?:tsup|tsdown|rollup|esbuild|build)[.-]/.test(name) ? 'conditions' : 'resolve.conditions (and ssr.resolve.conditions)';
}

/** A JSON file's contents, named in the error when it doesn't parse (one bad manifest shouldn't sink the run) */
function readJsonFile<T>(file: string): T {
  const text = fs.readFileSync(file, 'utf-8');
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new Error(`${file}: invalid JSON (${(error as Error).message})`);
  }
}

/** The workspace packages whose exports resolve TypeScript source under the condition */
export function sourceConditionPackages(root = repoRoot): string[] {
  const dir = path.join(root, 'packages');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(dir, entry.name, 'package.json')))
    .map((entry) => readJsonFile<{ name?: string; exports?: unknown }>(path.join(dir, entry.name, 'package.json')))
    .filter((manifest) => manifest.name !== undefined && JSON.stringify(manifest.exports ?? {}).includes(`"${SOURCE_CONDITION}"`))
    .map((manifest) => manifest.name!);
}

/** A per-run cache: each call to the check builds its own, so a temp tree is never read as stale */
function cached<T>(store: Map<string, T>, key: string, compute: () => T): T {
  const hit = store.get(key);
  if (hit !== undefined) return hit;
  const value = compute();
  store.set(key, value);
  return value;
}

/** What the source-condition check reads, cached per run */
interface ConditionScan {
  packages: readonly string[];
  configs: string[];
  code: string[];
  /** Every directory holding an `abuddy.json` */
  packs: string[];
  /** Whether a file imports one of `packages`, by absolute path */
  imports: Map<string, boolean>;
  tsconfigs: Map<string, ts.ParsedCommandLine>;
  sources: Map<string, ts.SourceFile>;
}

/**
 * Every config file and every code file under `dir`, collected into `scan`. Symlinked directories are
 * descended (a `Dirent` never reports one as a directory, so code reachable only through a symlinked
 * `src` would be invisible). `ancestors` holds the real path of every directory on the way in, so a
 * link back to one of them ends the walk at once; a real directory reached by two different paths is
 * still walked under each, since that is where the configs above it look for code.
 */
function walkTree(dir: string, scan: ConditionScan, ancestors: Set<string>): void {
  let real: string;
  try {
    real = fs.realpathSync(dir);
  } catch {
    return;
  }
  if (ancestors.has(real)) return;
  ancestors.add(real);
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const what = entry.isSymbolicLink() ? fs.statSync(full, { throwIfNoEntry: false }) : entry;
    if (what?.isDirectory()) {
      if (!SKIPPED_DIRS.test(entry.name)) walkTree(full, scan, ancestors);
    } else if (what?.isFile()) {
      // A config is code too: a tsconfig that lists `vitest.config.ts` compiles it
      if (CONFIG_FILE.test(entry.name)) scan.configs.push(full);
      if (CODE_FILE.test(entry.name)) scan.code.push(full);
      // A directory with a manifest is a pack, and a pack resolves the packages' published dist
      if (entry.name === 'abuddy.json') scan.packs.push(dir);
    }
  }
  ancestors.delete(real);
}

function importsSourcePackage(file: string, scan: ConditionScan): boolean {
  return cached(scan.imports, file, () => {
    if (!CODE_FILE.test(file) || !fs.existsSync(file)) return false;
    const code = fs.readFileSync(file, 'utf-8');
    // A file that never spells a package's name imports none of them: skip the parse
    if (!scan.packages.some((pkg) => code.includes(pkg))) return false;
    const matches = (text: string) => scan.packages.some((pkg) => text === pkg || text.startsWith(`${pkg}/`));
    return codeBlocks(file).some(({ content }) => specifiers(content, file, true).some(({ text }) => matches(text)));
  });
}

/** The code a config compiles or bundles: nothing, exactly these files, or everything under these directories */
type ConfigScope =
  | { kind: 'none' }
  | { kind: 'files'; files: string[] }
  /** `hint` says why the scope had to be widened to a directory, and is reported with the problem */
  | { kind: 'trees'; dirs: string[]; hint?: string };

function compilesImportingCode(scope: ConfigScope, scan: ConditionScan): boolean {
  if (scope.kind === 'none') return false;
  if (scope.kind === 'files') return scope.files.some((file) => importsSourcePackage(file, scan));
  return scan.code.some((file) => scope.dirs.some((dir) => file.startsWith(dir + path.sep)) && importsSourcePackage(file, scan));
}

/** A tsconfig with its `extends` chain resolved, the way tsc reads it */
function parsedTsconfig(file: string, scan: ConditionScan): ts.ParsedCommandLine {
  return cached(scan.tsconfigs, file, () => {
    const host: ts.ParseConfigFileHost = {
      useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
      readDirectory: ts.sys.readDirectory,
      fileExists: ts.sys.fileExists,
      readFile: ts.sys.readFile,
      getCurrentDirectory: () => path.dirname(file),
      onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
        throw new Error(`${file}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`);
      },
    };
    const parsed = ts.getParsedCommandLineOfConfigFile(file, {}, host);
    if (parsed === undefined) throw new Error(`${file}: could not be read as a tsconfig`);
    return parsed;
  });
}

function configSource(file: string, scan: ConditionScan): ts.SourceFile {
  return cached(scan.sources, file, () => ts.createSourceFile(file, fs.readFileSync(file, 'utf-8'), ts.ScriptTarget.Latest, true));
}

/** An expression with its parentheses and its `as`/`satisfies` assertions stripped */
function unwrap(expression: ts.Expression): ts.Expression {
  return ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression) || ts.isSatisfiesExpression(expression)
    ? unwrap(expression.expression) : expression;
}

/** A property name as written, for identifiers and string literals alike */
function propertyName(name: ts.PropertyName): string | undefined {
  return ts.isIdentifier(name) || ts.isStringLiteralLike(name) ? name.text : undefined;
}

function ownProperty(object: ts.ObjectLiteralExpression, name: string): ts.ObjectLiteralElementLike | undefined {
  return object.properties.find((p) => p.name !== undefined && propertyName(p.name) === name);
}

/** The object a config expression yields, through wrappers, `defineConfig(…)` and the function that returns it */
function configObjectOf(raw: ts.Expression, found: ts.ObjectLiteralExpression[], seen: Set<ts.Node>): void {
  const expression = unwrap(raw);
  if (seen.has(expression)) return;
  seen.add(expression);
  if (ts.isObjectLiteralExpression(expression)) found.push(expression);
  else if (ts.isCallExpression(expression)) {
    for (const argument of expression.arguments) configObjectOf(argument, found, seen);
  } else if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) {
    if (ts.isBlock(expression.body)) {
      const returns = (node: ts.Node): void => {
        if (ts.isReturnStatement(node) && node.expression) configObjectOf(node.expression, found, seen);
        // A nested function returns something else
        if (!ts.isFunctionLike(node) || node === expression) node.forEachChild(returns);
      };
      expression.body.forEachChild(returns);
    } else configObjectOf(expression.body, found, seen);
  }
}

/**
 * The object literals that carry a config's own options: what the file exports by default (through
 * `defineConfig(…)`, `mergeConfig(…)` and a function that returns it), any object with a `test`
 * option, and that `test` option itself.
 */
function configObjects(source: ts.SourceFile): ts.ObjectLiteralExpression[] {
  const found: ts.ObjectLiteralExpression[] = [];
  const seen = new Set<ts.Node>();
  const walk = (node: ts.Node): void => {
    if (ts.isExportAssignment(node) && !node.isExportEquals) configObjectOf(node.expression, found, seen);
    if (ts.isObjectLiteralExpression(node)) {
      const test = ownProperty(node, 'test');
      if (test !== undefined) {
        if (!found.includes(node)) found.push(node);
        if (ts.isPropertyAssignment(test) && ts.isObjectLiteralExpression(test.initializer) && !found.includes(test.initializer)) {
          found.push(test.initializer);
        }
      }
    }
    node.forEachChild(walk);
  };
  walk(source);
  return found;
}

/**
 * A Vitest config that compiles nothing of its own: a `test.projects` (or the older `test.workspace`)
 * that names other configs by path, each of which declares its own conditions, environment and setup.
 * A `projects` elsewhere in the file is somebody else's option — `vite-tsconfig-paths({ projects })`
 * takes one — and a `test` that also names files of its own (`include`, `setupFiles`, …) compiles
 * them under this config, so neither exempts it.
 */
function projectListScope(file: string, scan: ConditionScan): ConfigScope | undefined {
  if (!/^(?:vite|vitest)[.-]/.test(path.basename(file))) return undefined;
  const source = configSource(file, scan);
  for (const object of configObjects(source)) {
    const list = ownProperty(object, 'projects') ?? ownProperty(object, 'workspace');
    if (list === undefined) continue;
    if (TEST_FILE_OPTIONS.some((option) => ownProperty(object, option) !== undefined)) return undefined;
    const value = ts.isPropertyAssignment(list) ? list.initializer : ts.isShorthandPropertyAssignment(list) ? list.name : undefined;
    // A path per project, or the older `workspace: './vitest.workspace.ts'`: each config resolves for itself
    if (value !== undefined && namesPaths(value, source, new Set())) return { kind: 'none' };
    // Built at run time: what it compiles can't be read here, so say so rather than guess
    return {
      kind: 'trees',
      dirs: [path.dirname(file)],
      hint: `its ${propertyName(list.name!)!} isn't a literal list of project paths, so what this config compiles can't be read here — name each project by path, declare the condition anyway, or list it in RESOLVES_DIST_BY_DESIGN`,
    };
  }
  return undefined;
}

/** Whether an expression is a non-empty list of string literals, or an identifier the file declares as one */
function namesPaths(raw: ts.Expression, source: ts.SourceFile, seen: Set<ts.Node>): boolean {
  const value = unwrap(raw);
  if (seen.has(value)) return false;
  seen.add(value);
  if (ts.isStringLiteralLike(value)) return true;
  if (ts.isArrayLiteralExpression(value)) return value.elements.length > 0 && value.elements.every(ts.isStringLiteralLike);
  if (ts.isIdentifier(value)) {
    const declared = declarationsOf(source, value.text);
    return declared.length === 1 && namesPaths(declared[0], source, seen);
  }
  return false;
}

/** A `root` a config sets on itself or on its `test` option, resolved against the config's directory */
function configuredRoots(file: string, scan: ConditionScan): string[] {
  return configObjects(configSource(file, scan)).flatMap((object) => {
    const root = ownProperty(object, 'root');
    return root !== undefined && ts.isPropertyAssignment(root) && ts.isStringLiteralLike(root.initializer)
      ? [path.resolve(path.dirname(file), root.initializer.text)] : [];
  });
}

/**
 * What a config compiles or bundles. A tsconfig's `files` and `include` are resolved the way tsc
 * resolves them, so a config that reaches outside its own directory is seen and one that covers a
 * sibling's code only is not blamed for it. A bundler config covers its own directory and any `root`
 * it names — a union, never a narrowing, since its entry points may sit outside that root.
 */
function configScope(file: string, scan: ConditionScan): ConfigScope {
  const dir = path.dirname(file);
  if (!file.endsWith('.json')) {
    return projectListScope(file, scan) ?? { kind: 'trees', dirs: [dir, ...configuredRoots(file, scan)] };
  }
  const parsed = parsedTsconfig(file, scan);
  const raw = (parsed.raw ?? {}) as { files?: unknown; include?: unknown };
  const emptyList = (value: unknown) => Array.isArray(value) && value.length === 0;
  // A solution file (`files: []` with only references) and an explicit `include: []` compile nothing.
  // `files: []` beside an `include` still compiles that include, so it is not one of them.
  const listsNothing = raw.include === undefined
    ? emptyList(raw.files)
    : emptyList(raw.include) && (raw.files === undefined || emptyList(raw.files));
  if (listsNothing) return { kind: 'none' };
  if (parsed.fileNames.length > 0) return { kind: 'files', files: parsed.fileNames };
  // Its specs name files that aren't on disk in this state (a generated .temp/api-types, an unbuilt
  // dist). Fall back to the directory it sits in rather than read it as compiling nothing.
  return { kind: 'trees', dirs: [dir] };
}

/** A relative config import resolved to the JavaScript or TypeScript file it names, or undefined */
function resolveConfig(from: string, specifier: string): string | undefined {
  if (!/^\.\.?\//.test(specifier)) return undefined;
  const base = path.resolve(path.dirname(from), specifier);
  return CONFIG_EXTENSIONS.map((ext) => `${base}${ext}`)
    .find((candidate) => /\.[cm]?[jt]s$/.test(candidate) && fs.existsSync(candidate) && fs.statSync(candidate).isFile());
}

/** Whether a config declares the condition: yes, no, or an option this check can't read */
type Verdict = true | false | { unreadable: string };

/** True when the verdicts carry the condition (all of them with `every`, otherwise any); else the first unreadable one */
function combine(verdicts: Verdict[], every = false): Verdict {
  if (every ? verdicts.every((v) => v === true) : verdicts.some((v) => v === true)) return true;
  return verdicts.find((v) => v !== true && v !== false) ?? false;
}

/** Everything `pick` finds in the file's syntax tree */
function collect<T>(source: ts.SourceFile, pick: (node: ts.Node) => T | undefined): T[] {
  const found: T[] = [];
  const walk = (node: ts.Node): void => {
    const value = pick(node);
    if (value !== undefined) found.push(value);
    node.forEachChild(walk);
  };
  walk(source);
  return found;
}

/**
 * Every expression a config assigns to a `conditions` option: `resolve: { conditions: [...] }`,
 * the shorthand `{ conditions }`, and `esbuildOptions.conditions = [...]`.
 */
function conditionValues(source: ts.SourceFile): ts.Expression[] {
  return collect(source, (node) => {
    if (ts.isPropertyAssignment(node) && propertyName(node.name) === 'conditions') return node.initializer;
    if (ts.isShorthandPropertyAssignment(node) && node.name.text === 'conditions') return node.name;
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && ts.isPropertyAccessExpression(node.left) && node.left.name.text === 'conditions') return node.right;
    return undefined;
  });
}

/** The initializers of every `const`/`let` declaration of `name` in the file */
function declarationsOf(source: ts.SourceFile, name: string): ts.Expression[] {
  return collect(source, (node) => (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name
    ? node.initializer : undefined));
}

/** Whether an expression yields a condition list holding the source condition, or can't be read here */
function yieldsCondition(raw: ts.Expression, source: ts.SourceFile, seen: Set<ts.Node>): Verdict {
  const value = unwrap(raw);
  if (seen.has(value)) return false;
  seen.add(value);
  if (ts.isStringLiteralLike(value)) return value.text === SOURCE_CONDITION;
  if (ts.isArrayLiteralExpression(value)) {
    // An array says what it holds: only its spreads can hide the condition
    if (value.elements.some((el) => ts.isStringLiteralLike(el) && el.text === SOURCE_CONDITION)) return true;
    return combine(value.elements.filter(ts.isSpreadElement).map((el) => yieldsCondition(el.expression, source, seen)));
  }
  if (ts.isIdentifier(value)) {
    const declared = declarationsOf(source, value.text);
    if (declared.length === 0) return { unreadable: `the condition list ${value.text} comes from outside this file` };
    return combine(declared.map((init) => yieldsCondition(init, source, seen)));
  }
  // A computed list says nothing either way: every config that needs the condition names it outright
  if (ts.isCallExpression(value)) {
    const callee = ts.isIdentifier(value.expression) ? value.expression.text
      : ts.isPropertyAccessExpression(value.expression) ? value.expression.name.text : undefined;
    return { unreadable: `its condition list is built by ${callee ?? 'a call'}()` };
  }
  // Both branches of a conditional must carry it: one that doesn't resolves dist
  if (ts.isConditionalExpression(value)) {
    return combine([value.whenTrue, value.whenFalse].map((branch) => yieldsCondition(branch, source, seen)), true);
  }
  return { unreadable: 'its condition list is an expression this check cannot read' };
}

/**
 * Whether a config declares the source condition. A tsconfig is read the way tsc reads it, so an
 * `extends` chain of any shape — a relative path, a file named anything, a package base — counts.
 * A bundler config declares it in a `conditions` option; only when it sets none does a config it is
 * built from (`mergeConfig(viteConfig, …)`) decide, since its own `conditions` replace what it merged.
 */
function declaresCondition(file: string, scan: ConditionScan, seen = new Set<string>()): Verdict {
  if (seen.has(file) || !fs.existsSync(file)) return false;
  seen.add(file);
  if (file.endsWith('.json')) {
    return parsedTsconfig(file, scan).options.customConditions?.includes(SOURCE_CONDITION) ?? false;
  }
  const source = configSource(file, scan);
  const values = conditionValues(source);
  if (values.length > 0) return combine(values.map((value) => yieldsCondition(value, source, new Set())));
  let unreadable: Verdict | undefined;
  for (const { text } of specifiers(source.text, file, false)) {
    const resolved = resolveConfig(file, text);
    if (resolved === undefined) continue;
    const verdict = declaresCondition(resolved, scan, seen);
    if (verdict === true) return true;
    if (verdict !== false) unreadable ??= verdict;
  }
  return unreadable ?? false;
}

/**
 * `file: what` for each workspace config that compiles or bundles code importing a source-condition
 * package and neither declares the condition nor is listed in `RESOLVES_DIST_BY_DESIGN`; without it the
 * config silently reads a stale or absent `dist`. A config whose conditions or project list can't be
 * read statically is reported too, with what to change: a rule that guesses is a rule that lets the
 * next one through. An exception that no longer applies is reported too, so the list doesn't outlive
 * its reason.
 */
export function findMissingSourceConditions(
  root = repoRoot,
  exceptions = RESOLVES_DIST_BY_DESIGN,
  packExceptions = DECLARES_SOURCE_BY_DESIGN,
): string[] {
  const scan: ConditionScan = {
    packages: sourceConditionPackages(root),
    configs: [], code: [], packs: [], imports: new Map(), tsconfigs: new Map(), sources: new Map(),
  };
  walkTree(root, scan, new Set());
  const problems: string[] = [];
  const applied = new Set<string>();
  const packApplied = new Set<string>();
  const inPack = (file: string) => scan.packs.some((pack) => file.startsWith(pack + path.sep));
  for (const file of scan.configs.sort()) {
    const relative = path.relative(root, file).split(path.sep).join('/');
    const verdict = declaresCondition(file, scan);
    // A pack compiles the packages' published dist, the one layout a pack author has, so its configs
    // declare nothing. The rule is the other way round for the repo's own code, below.
    if (inPack(file)) {
      if (verdict === false) continue;
      if (packExceptions.has(relative)) { packApplied.add(relative); continue; }
      problems.push(`${relative}: a pack resolves the @abuddy packages' published dist, so it must not declare "${SOURCE_CONDITION}" in ${conditionOption(file)}`
        + '; move a host-side config out of the pack tree, or add it to DECLARES_SOURCE_BY_DESIGN saying why it belongs there');
      continue;
    }
    const scope = configScope(file, scan);
    if (verdict === true || !compilesImportingCode(scope, scan)) continue;
    if (exceptions.has(relative)) { applied.add(relative); continue; }
    const notes = [verdict === false ? undefined : verdict.unreadable, scope.kind === 'trees' ? scope.hint : undefined];
    problems.push(`${relative}: needs ${conditionOption(file)} with "${SOURCE_CONDITION}", or an entry in RESOLVES_DIST_BY_DESIGN saying why it resolves dist`
      + notes.filter((note) => note !== undefined).map((note) => `; ${note}`).join(''));
  }
  const present = new Set(scan.configs.map((file) => path.relative(root, file).split(path.sep).join('/')));
  for (const [relative, reason] of exceptions) {
    if (!applied.has(relative)) {
      problems.push(`${relative}: listed in RESOLVES_DIST_BY_DESIGN (${reason}) but ${present.has(relative) ? 'it already declares the condition or compiles no such code' : 'the config is gone'}`);
    }
  }
  // An exception that stopped applying is itself a problem: the reason it records is no longer true of
  // anything, and a row nobody revisits is how a table like this grows past what it can justify
  for (const [relative, reason] of packExceptions) {
    if (!packApplied.has(relative)) {
      problems.push(`${relative}: listed in DECLARES_SOURCE_BY_DESIGN (${reason}) but ${present.has(relative) ? 'it declares no condition, so it needs no exception' : 'the config is gone'}`);
    }
  }
  return problems;
}

/**
 * Each workspace package, resolved the way TypeScript resolves it, must land inside this checkout.
 *
 * A worktree created under the repository (Claude Code's `.claude/worktrees/`, say) is isolated for
 * writes and porous for reads: TypeScript keeps walking up for `node_modules` when a package's own
 * types target is missing, so a workspace package whose build output this checkout lacks resolves to
 * the *parent* checkout's built output. A typecheck then passes against another checkout's files —
 * including a half-finished edit someone else is making. A package that resolves nowhere is fine:
 * that is an honest "not built", which is what a worktree outside the repository gives you.
 */
export function findCrossCheckoutResolution(root = repoRoot): string[] {
  const checkout = fs.realpathSync(root);
  const host = {
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    directoryExists: ts.sys.directoryExists,
    getCurrentDirectory: () => checkout,
    getDirectories: ts.sys.getDirectories,
    realpath: ts.sys.realpath,
  };
  // A file inside the checkout: resolution starts from its directory, whether or not the file exists
  const from = path.join(checkout, 'packages', '__resolution-probe__.ts');
  const problems: string[] = [];
  for (const dir of fs.readdirSync(path.join(checkout, 'packages'))) {
    const manifest = path.join(checkout, 'packages', dir, 'package.json');
    if (!fs.existsSync(manifest)) continue;
    const { name } = readJsonFile<{ name?: string }>(manifest);
    if (name === undefined) continue;
    // Bundler resolution: the repo's other mode (nodenext) walks up the same way, so one pass sees it
    const resolved = ts.resolveModuleName(name, from, { moduleResolution: ts.ModuleResolutionKind.Bundler }, host).resolvedModule?.resolvedFileName;
    if (resolved === undefined) continue;
    const real = fs.realpathSync(resolved);
    if (real === checkout || real.startsWith(checkout + path.sep)) continue;
    problems.push(`${name} resolves to ${real}, outside this checkout (${checkout}). `
      + 'A worktree inside the repository reads the parent checkout when its own build output is missing: '
      + 'build it here, or create worktrees outside the repository (a WorktreeCreate hook).');
  }
  return [...new Set(problems)];
}

// Run as a script, also through a symlinked path (tests import findJsSpecifiers)
if (process.argv[1] && import.meta.filename === fs.realpathSync(process.argv[1])) {
  const checks: [find: () => string[], rule: string][] = [
    [findJsSpecifiers, 'Relative imports must name the TypeScript source (tsc and tsdown emit .js)'],
    [findRawPackHelpers, 'Pack code uses the typed facades: emit, sendToPlugin and sendToSystem from #generated/events, repositories declared in abuddy.json'],
    [findRawTransport, 'Pack code sends with sendToPlugin and sendToSystem from #generated/events, and subscribes with onConnected and onIncoming from @abuddy/sdk/events'],
    [findPackBackendConsole, 'Pack backend code logs with createLogger from @abuddy/sdk/logger'],
    [findHostImports, "Pack code doesn't import the host's private @abuddy/host package; use @abuddy/sdk"],
    [findAppImportsInPackTests, 'Pack unit tests run on the harness (@abuddy/testing) without the app; test host, API and CLI code in its own package'],
    [findUpwardImports, "Packages import only downward (@abuddy/ears imports no @abuddy package, @abuddy/sdk only @abuddy/ears, @abuddy/host only those two and never the API, the API and the renderer only the packages below them), and list each @abuddy package they import in their package.json"],
    [findLmdbImports, "Only @abuddy/ears/lmdb loads lmdb: the host and the API open the store through it, the engine's root and packs never load it"],
    [findSharedPackageLists, 'Derive shared-instance packages from SHARED_INSTANCE_PACKAGES (@abuddy/host/build/shared-deps) instead of naming them'],
    [findRepositoryCasts, "Call a package's repositories through its exports, not a cast of the repository registry"],
    [findCrossCheckoutResolution, 'Workspace packages resolve inside this checkout, so a worktree nested in the repository never typechecks against the parent checkout'],
    [findMissingSourceConditions, "The repo's own configs declare the @abuddy/source condition when they compile or bundle code importing @abuddy/ears, @abuddy/sdk, @abuddy/ui or @abuddy/testing, so they read TypeScript source instead of a stale dist; a pack's configs declare none, because a pack resolves the published dist"],
  ];
  for (const [find, rule] of checks) {
    const problems = find();
    if (problems.length > 0) {
      console.error(`${rule}:\n  ${problems.join('\n  ')}`);
      process.exit(1);
    }
  }
  console.log('Import specifiers and pack rules pass');
}
