// @abuddy/ears, @abuddy/sdk, @abuddy/host and @abuddy/ui import their own modules by source file name
// (`./query.ts`); tsc and tsdown write `.js` into the output. Fails on a relative `.js`
// specifier that names a TypeScript module (`.js` → .ts/.tsx, `.mjs` → .mts, `.cjs` → .cts), in
// TypeScript files and .vue <script> blocks. Covers imports, re-exports, dynamic imports, import
// types, `import x = require()`, require() and module-path calls like vi.mock(). Imports of
// hand-written declarations (`./speech-event.js` → speech-event.d.ts) have no source and are fine.
// Extensionless imports already fail the packages' nodenext typecheck.
//
// Also checks the pack rules below (typed facades, no host imports in packs, …), that the layered
// packages import only downward (findUpwardImports), that only @abuddy/ears/lmdb loads lmdb
// (findLmdbImports), that the shared-instance package list has one source (findSharedPackageLists), and that no
// package reads repositories through a cast (findRepositoryCasts).
//
//   tsx scripts/check-import-specifiers.ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';
import { parse as parseSfc } from '@vue/compiler-sfc';
import { SHARED_INSTANCE_PACKAGES } from '@abuddy/host/build/shared-deps';

const repoRoot = path.resolve(import.meta.dirname, '..');
export const CHECKED_DIRS = [
  'packages/abuddy-ears/src', 'packages/abuddy-ears/tests', 'packages/abuddy-ears/scripts',
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

/** Specifiers in a module (relative ones only unless `all`): every static and dynamic form that names a module path. */
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

/** `file:line: specifier` for each relative emitted-extension specifier that names a TypeScript module. */
export function findJsSpecifiers(dirs = CHECKED_DIRS, root = repoRoot): string[] {
  const problems: string[] = [];
  for (const dir of dirs) {
    for (const file of sourceFiles(path.join(root, dir))) {
      for (const { content, lineOffset } of codeBlocks(file)) {
        for (const { text, line } of specifiers(content, file)) {
          const emitted = path.extname(text);
          const base = path.resolve(path.dirname(file), text.slice(0, -emitted.length));
          if ((SOURCE_EXTENSIONS[emitted] ?? []).some((ext) => fs.existsSync(`${base}${ext}`))) {
            problems.push(`${path.relative(root, file)}:${line + lineOffset}: ${text}`);
          }
        }
      }
    }
  }
  return problems;
}

/** CLI sources whose template strings are the pack source `abuddy init` and `abuddy add` write */
export const CLI_TEMPLATE_SOURCES = ['packages/abuddy-cli/src/commands/add', 'packages/abuddy-cli/src/commands/init.ts'];

/** Pack sources (each a pack's `src` root) and the pack templates the CLI writes, which use the generated facades */
export const PACK_SOURCE_DIRS = [
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

/** What a rule reports for a syntax node, if anything */
type Rule = (node: ts.Node) => string[] | undefined;

/** The module a static import or export, or a dynamic import(), names */
function moduleOf(node: ts.Node): string | undefined {
  const literal = ts.isImportDeclaration(node) || ts.isExportDeclaration(node) ? node.moduleSpecifier
    : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword ? node.arguments[0] : undefined;
  return literal && ts.isStringLiteralLike(literal) ? literal.text : undefined;
}

/**
 * A template literal's text as code, `${…}` blanked to `_` (line breaks kept) and `\``, `\$`, `\\`
 * unescaped in place, so positions stay put
 */
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
 * `file:line: what` for each finding of `rule` in `files`. The syntax tree leaves out comments and
 * string text; .vue files are read in their <script> blocks. In the CLI's template sources, template
 * literals are pack code and are scanned as such.
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

/** Imports and re-exports of the untyped sends (and the engine's registerRepository and unregisterRepository), or all of @abuddy/sdk/events */
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

/**
 * `file:line: name from module` for each untyped send or repository registration a pack source
 * imports or re-exports from an `@abuddy/*` module. Generated files are exempt.
 */
export function findRawPackHelpers(dirs = PACK_SOURCE_DIRS, root = repoRoot): string[] {
  const files = packFiles(dirs, root).filter((file) => !file.split(path.sep).includes('__generated__'));
  return findInFiles(files, root, rawPackHelper);
}

/**
 * `file:line: specifier` for each `@abuddy/host` module a pack source loads: static and type
 * imports, re-exports, dynamic imports and requires, also inside template strings the CLI writes as
 * pack source. The host package is private to the app; packs use @abuddy/sdk (including
 * `services.appData` and `services.traceStore` for host-implemented data operations). Generated files
 * are checked too.
 */
export function findHostImports(dirs = PACK_SOURCE_DIRS, root = repoRoot): string[] {
  const problems: string[] = [];
  const files = dirs.flatMap((dir) => {
    const full = path.join(root, dir);
    if (!fs.existsSync(full)) return [];
    return fs.statSync(full).isFile() ? [full] : [...sourceFiles(full)];
  });
  const hostPattern = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)['"](@abuddy\/host(?:\/[^'"]*)?)['"]/g;
  for (const file of files) {
    const code = fs.readFileSync(file, 'utf-8');
    for (const match of code.matchAll(hostPattern)) {
      const line = code.slice(0, match.index).split('\n').length;
      problems.push(`${path.relative(root, file)}:${line}: ${match[1]}`);
    }
  }
  return problems;
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

/**
 * `file:line: what` for each raw event path a pack source uses, which the typed sends in
 * #generated/events replace. Generated files are checked too.
 */
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
 * `createLogger` from `@abuddy/sdk/logger`. Only pack `src` directories are checked: not the
 * CLI's template sources (their console output is the CLI's) or single files.
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
export const PACK_TEST_DIRS = ['packages/default-setup/tests', 'tests/fixtures/external-pack/tests'];

/** API modules (its `@/` alias) and host, API or CLI sources by relative path */
const APP_SPECIFIER = /^(?:@abuddy\/host(?:\/|$)|@\/(?:core|setup)(?:\/|$)|(?:\.\.?\/)+(?:[\w.-]+\/)*(?:api|abuddy-host|abuddy-cli)\/src(?:\/|$))/;

/**
 * `file:line: specifier` for each app module a pack's unit tests load: `@abuddy/host`, the API's
 * modules (its `@/core`, `@/setup` alias) or host, API and CLI sources by relative path.
 * Tests of app code belong to that package; pack tests use @abuddy/sdk and @abuddy/testing.
 */
export function findAppImportsInPackTests(dirs = PACK_TEST_DIRS, root = repoRoot): string[] {
  const problems: string[] = [];
  const files = dirs.flatMap((dir) => {
    const full = path.join(root, dir);
    return fs.existsSync(full) ? [...sourceFiles(full)] : [];
  });
  const specifierPattern = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g;
  for (const file of files) {
    const code = fs.readFileSync(file, 'utf-8');
    for (const match of code.matchAll(specifierPattern)) {
      if (!APP_SPECIFIER.test(match[1])) continue;
      const line = code.slice(0, match.index).split('\n').length;
      problems.push(`${path.relative(root, file)}:${line}: ${match[1]}`);
    }
  }
  return problems;
}

/**
 * The layered packages, lowest first (docs/goals/goal-package-boundaries.md, Decision 1): the
 * `@abuddy/*` packages each may import, and path patterns it must never load.
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
];

const abuddyPackage = (specifier: string) => specifier.match(/^@abuddy\/[^/]+/)?.[0];

/**
 * `file:line: specifier` for each import a layered package makes upward: an `@abuddy/*` package it
 * may not use, or a module its layer forbids. Also `package.json: <field>: name` for each `@abuddy/*`
 * package a manifest declares beyond the allowed ones. Sources, tests and scripts are checked.
 */
export function findUpwardImports(layers = LAYERS, root = repoRoot): string[] {
  const problems: string[] = [];
  for (const { name, dir, allowed, forbidden } of layers) {
    const permitted = new Set([name, ...allowed]);
    for (const sub of ['src', 'tests', 'scripts']) {
      const full = path.join(root, dir, sub);
      if (!fs.existsSync(full)) continue;
      for (const file of sourceFiles(full)) {
        for (const { content, lineOffset } of codeBlocks(file)) {
          for (const { text, line } of specifiers(content, file, true)) {
            const pkg = abuddyPackage(text);
            if ((pkg && !permitted.has(pkg)) || forbidden?.test(text)) {
              problems.push(`${path.relative(root, file)}:${line + lineOffset}: ${text}`);
            }
          }
        }
      }
    }
    const manifestFile = path.join(root, dir, 'package.json');
    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf-8')) as Record<string, Record<string, string> | undefined>;
    for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies', 'devDependencies']) {
      for (const dep of Object.keys(manifest[field] ?? {})) {
        if (dep.startsWith('@abuddy/') && !permitted.has(dep)) problems.push(`${path.relative(root, manifestFile)}: ${field}: ${dep}`);
      }
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
  const problems: string[] = [];
  for (const { dirs, except, forbidden } of rules) {
    const allowed = except && path.join(root, except) + path.sep;
    for (const file of packFiles(dirs, root)) {
      if (allowed && file.startsWith(allowed)) continue;
      for (const { content, lineOffset } of codeBlocks(file)) {
        for (const { text, line } of specifiers(content, file, true)) {
          if (forbidden.test(text)) problems.push(`${path.relative(root, file)}:${line + lineOffset}: ${text}`);
        }
      }
    }
  }
  return problems;
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
 * `file:line: "text"` for each string in a consumer of the shared-instance list that names one of
 * the packages (`'@abuddy/sdk'`, `'@abuddy/ears/*'`) outside an import. Specific modules
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

/**
 * The engine's repository registry, `repository` or `….repository`, through parentheses. A generated
 * `#generated/repository` types it once, from the repositories its own pack declares (`earsRepository`).
 */
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
 * `file:line: code` for each `repository as unknown as …` in `dirs` (every package's src/ by default): each entity's
 * repository lives with the package that declares it, and other packages call it through its exports
 * (docs/goals/goal-package-boundaries.md, Decision 7), never through a cast of the engine's registry
 */
export function findRepositoryCasts(dirs = packageSourceDirs(), root = repoRoot): string[] {
  return findInFiles(packFiles(dirs, root), root, repositoryCast);
}

// Run as a script, also through a symlinked path (tests import findJsSpecifiers)
if (process.argv[1] && import.meta.filename === fs.realpathSync(process.argv[1])) {
  const problems = findJsSpecifiers();
  if (problems.length > 0) {
    console.error(`Relative imports must name the TypeScript source (tsc and tsdown emit .js):\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  const rawHelpers = findRawPackHelpers();
  if (rawHelpers.length > 0) {
    console.error(`Pack code uses the typed facades: emit, sendToPlugin and sendToSystem from #generated/events, repositories declared in abuddy.json:\n  ${rawHelpers.join('\n  ')}`);
    process.exit(1);
  }
  const rawTransport = findRawTransport();
  if (rawTransport.length > 0) {
    console.error(`Pack code sends with sendToPlugin and sendToSystem from #generated/events, and subscribes with onConnected and onIncoming from @abuddy/sdk/events:\n  ${rawTransport.join('\n  ')}`);
    process.exit(1);
  }
  const backendConsole = findPackBackendConsole();
  if (backendConsole.length > 0) {
    console.error(`Pack backend code logs with createLogger from @abuddy/sdk/logger:\n  ${backendConsole.join('\n  ')}`);
    process.exit(1);
  }
  const hostImports = findHostImports();
  if (hostImports.length > 0) {
    console.error(`Pack code doesn't import the host's private @abuddy/host package; use @abuddy/sdk:\n  ${hostImports.join('\n  ')}`);
    process.exit(1);
  }
  const appImports = findAppImportsInPackTests();
  if (appImports.length > 0) {
    console.error(`Pack unit tests run on the harness (@abuddy/testing) without the app; test host, API and CLI code in its own package:\n  ${appImports.join('\n  ')}`);
    process.exit(1);
  }
  const upward = findUpwardImports();
  if (upward.length > 0) {
    console.error(`Packages import only downward: @abuddy/ears imports no @abuddy package, @abuddy/sdk only @abuddy/ears, @abuddy/host only those two and never the API:\n  ${upward.join('\n  ')}`);
    process.exit(1);
  }
  const lmdbImports = findLmdbImports();
  if (lmdbImports.length > 0) {
    console.error(`Only @abuddy/ears/lmdb loads lmdb: the host and the API open the store through it, the engine's root and packs never load it:\n  ${lmdbImports.join('\n  ')}`);
    process.exit(1);
  }
  const sharedLists = findSharedPackageLists();
  if (sharedLists.length > 0) {
    console.error(`Derive shared-instance packages from SHARED_INSTANCE_PACKAGES (@abuddy/host/build/shared-deps) instead of naming them:\n  ${sharedLists.join('\n  ')}`);
    process.exit(1);
  }
  const repositoryCasts = findRepositoryCasts();
  if (repositoryCasts.length > 0) {
    console.error(`Call a package's repositories through its exports, not a cast of the repository registry:\n  ${repositoryCasts.join('\n  ')}`);
    process.exit(1);
  }
  console.log('Relative import specifiers name .ts sources');
}
