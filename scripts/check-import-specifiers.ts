// @abuddy/sdk, @abuddy/host and @abuddy/ui import their own modules by source file name
// (`./query.ts`); tsc and tsdown write `.js` into the output. Fails on a relative `.js`
// specifier that names a TypeScript module (`.js` → .ts/.tsx, `.mjs` → .mts, `.cjs` → .cts), in
// TypeScript files and .vue <script> blocks. Covers imports, re-exports, dynamic imports, import
// types, `import x = require()`, require() and module-path calls like vi.mock(). Imports of
// hand-written declarations (`./speech-event.js` → speech-event.d.ts) have no source and are fine.
// Extensionless imports already fail the packages' nodenext typecheck.
//
//   tsx scripts/check-import-specifiers.ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';
import { parse as parseSfc } from '@vue/compiler-sfc';

const repoRoot = path.resolve(import.meta.dirname, '..');
export const CHECKED_DIRS = [
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

/** Relative specifiers in a module: every static and dynamic form that names a module path. */
function specifiers(code: string, fileName: string): { text: string; line: number }[] {
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
    if (literal && /^\.\.?\//.test(literal.text)) {
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

/** Imports and re-exports of the untyped sends (and registerRepository), or all of @abuddy/sdk/events */
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
  const raw = module === '@abuddy/sdk/ears' ? [...EVENT_SENDS, 'registerRepository'] : EVENT_SENDS;
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
const APP_SPECIFIER = /^(?:@abuddy\/host(?:\/|$)|@\/(?:core|setup|packs|systems)(?:\/|$)|(?:\.\.?\/)+(?:[\w.-]+\/)*(?:api|abuddy-host|abuddy-cli)\/src(?:\/|$))/;

/**
 * `file:line: specifier` for each app module a pack's unit tests load: `@abuddy/host`, the API's
 * modules (its `@/core`, `@/setup`, `@/packs` alias) or host, API and CLI sources by relative path.
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
  console.log('Relative import specifiers name .ts sources');
}
