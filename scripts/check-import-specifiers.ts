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

/**
 * `code` with each comment's characters replaced by spaces (line breaks kept), so line numbers and
 * the contents of strings and template literals survive. The parser tells comments from comment-like
 * text in strings, templates and regular expressions: every comment is trivia around some token.
 */
export function blankComments(code: string, fileName: string): string {
  const source = parse(code, fileName);
  const chars = code.split('');
  const seen = new Set<number>();
  const visit = (node: ts.Node): void => {
    // JSDoc nodes lie inside the trivia the next token's comment ranges already cover
    if (node.kind >= ts.SyntaxKind.FirstJSDocNode && node.kind <= ts.SyntaxKind.LastJSDocNode) return;
    const children = node.getChildren(source);
    if (children.length > 0) return children.forEach(visit);
    if (node.kind === ts.SyntaxKind.JsxText || node.kind === ts.SyntaxKind.JsxTextAllWhiteSpaces || seen.has(node.pos)) return;
    seen.add(node.pos);
    // Comments after a token on its line are its trailing trivia; the rest lead the next token
    const ranges = [...ts.getLeadingCommentRanges(code, node.pos) ?? [], ...ts.getTrailingCommentRanges(code, node.end) ?? []];
    for (const range of ranges) {
      for (let i = range.pos; i < range.end; i++) if (chars[i] !== '\n' && chars[i] !== '\r') chars[i] = ' ';
    }
  };
  visit(source);
  return chars.join('');
}

/** A file's comment-free code blocks (see codeBlocks) */
function uncommentedBlocks(file: string): { content: string; lineOffset: number }[] {
  return codeBlocks(file).map(({ content, lineOffset }) => ({ content: blankComments(content, file), lineOffset }));
}

/** 1-based line of `index` in `text` */
function lineAt(text: string, index: number): number {
  return text.slice(0, index).split('\n').length;
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

/** Sends packs get typed from #generated/events, whichever SDK module exports them untyped */
const EVENT_SENDS = ['emit', 'sendToPlugin', 'sendToSystem'];

/** The helpers `module` must not provide to pack code: they come typed from #generated/events and #generated/repository */
function rawHelpersFrom(module: string): string[] {
  if (!module.startsWith('@abuddy/')) return [];
  return module === '@abuddy/sdk/ears' ? [...EVENT_SENDS, 'registerRepository'] : EVENT_SENDS;
}

const MODULE = String.raw`['"\`]([^'"\`]+)['"\`]`;
/** Named imports and re-exports (`import X, { a }`, `import type { a }`, `export { a } from`): names in group 1, module in group 2 */
const NAMED_IMPORT = new RegExp(String.raw`\b(?:import\s*(?:type\b\s*)?(?:[\w$]+\s*,\s*)?|export\s*(?:type\b\s*)?)\{([^}]*)\}\s*from\s*${MODULE}`, 'g');
/** Destructured dynamic imports and requires (`const { a } = await import(...)`): names in group 1, module in group 2 */
const DESTRUCTURED_LOAD = new RegExp(String.raw`\b(?:const|let|var)\s*\{([^}]*)\}\s*=\s*\(?\s*(?:await\s+)?(?:import|require)\s*\(\s*${MODULE}\s*\)`, 'g');
/** A member of a loaded module (`(await import(...)).a`, `require(...).a`): module in group 1, name in group 2 */
const LOADED_MEMBER = new RegExp(String.raw`\b(?:import|require)\s*\(\s*${MODULE}\s*\)\s*\)?\s*(?:\?\.|\.)\s*([\w$]+)`, 'g');
/**
 * The whole untyped events module (`import * as ev`, `export * from`, `const ev = await import(...)`):
 * pack code imports the names it uses (onConnected, onIncoming, sendToBrainSystem)
 */
const EVENTS_NAMESPACE = /\b(?:import\s*(?:type\b\s*)?(?:[\w$]+\s*,\s*)?\*\s*as\s+[\w$]+\s+from|export\s*(?:type\b\s*)?\*(?:\s*as\s+[\w$]+)?\s*from)\s*['"`]@abuddy\/sdk\/events['"`]|\b(?:const|let|var)\s+[\w$]+\s*=\s*\(?\s*(?:await\s+)?(?:import|require)\s*\(\s*['"`]@abuddy\/sdk\/events['"`]\s*\)(?!\s*\)?\s*(?:\?\.|\.|\[))/g;

/** The imported names in an import, export or destructuring list (`a as b`, `a: b`, `a = x`, `type a`) */
function listedNames(list: string): string[] {
  return list.split(',').map((item) => item.trim().replace(/^type\s+/, '').split(/\s+as\s+|\s*[:=]/)[0].trim());
}

/**
 * `file:line: name from module` for each untyped send or repository registration a pack source
 * imports from an `@abuddy/*` module: named imports (also next to a default import), re-exports,
 * destructured or member-accessed dynamic imports and requires, and whole-module imports of
 * `@abuddy/sdk/events`. Template strings are scanned too (the CLI writes them as pack source);
 * comments aren't, and .vue files only in their <script> blocks. Generated files are exempt.
 */
export function findRawPackHelpers(dirs = PACK_SOURCE_DIRS, root = repoRoot): string[] {
  const problems: string[] = [];
  const files = packFiles(dirs, root).filter((file) => !file.split(path.sep).includes('__generated__'));
  for (const file of files) {
    const found: { line: number; what: string }[] = [];
    for (const { content, lineOffset } of uncommentedBlocks(file)) {
      const add = (index: number, what: string) => found.push({ line: lineAt(content, index) + lineOffset, what });
      for (const pattern of [NAMED_IMPORT, DESTRUCTURED_LOAD]) {
        for (const match of content.matchAll(pattern)) {
          const names = rawHelpersFrom(match[2]);
          for (const name of listedNames(match[1]).filter((n) => names.includes(n))) add(match.index, `${name} from ${match[2]}`);
        }
      }
      for (const match of content.matchAll(LOADED_MEMBER)) {
        if (rawHelpersFrom(match[1]).includes(match[2])) add(match.index, `${match[2]} from ${match[1]}`);
      }
      for (const match of content.matchAll(EVENTS_NAMESPACE)) add(match.index, '* from @abuddy/sdk/events (import the names)');
    }
    found.sort((x, y) => x.line - y.line);
    for (const { line, what } of found) problems.push(`${path.relative(root, file)}:${line}: ${what}`);
  }
  return problems;
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

/** The host's raw event paths, which the typed sends in #generated/events replace */
const RAW_TRANSPORT: [RegExp, string | null][] = [
  // null: report the specifier itself
  [/['"`](@abuddy\/sdk\/rpc(?:\/[^'"`]*)?)['"`]/g, null],
  [/\brootEvents\b/g, 'rootEvents'],
  // trpc.bus, trpc?.bus, trpc!.bus
  [/\btrpc\s*!?\s*\??\.\s*bus\b/g, 'trpc.bus'],
  // trpc['bus'], trpc?.["bus"]
  [/\btrpc\s*!?\s*(?:\?\.\s*)?\[\s*['"`]bus['"`]\s*\]/g, 'trpc.bus'],
  // const { bus } = trpc, const { bus: b, x } = trpc
  [/\{(?:[^{}]*,)?\s*bus\s*(?:[:,=][^{}]*)?\}\s*=\s*trpc\b/g, 'trpc.bus'],
];

/**
 * `file:line: what` for each raw event path a pack source uses: an `@abuddy/sdk/rpc` module
 * (or a subpath), `rootEvents` or the `bus` router of `trpc` (member access, element access or
 * destructuring). Template strings are scanned too (the CLI writes them as pack source); comments
 * aren't, and .vue files only in their <script> blocks. Generated files are checked too.
 */
export function findRawTransport(dirs = PACK_SOURCE_DIRS, root = repoRoot): string[] {
  const problems: string[] = [];
  for (const file of packFiles(dirs, root)) {
    const found: { line: number; order: number; index: number; what: string }[] = [];
    for (const { content, lineOffset } of uncommentedBlocks(file)) {
      RAW_TRANSPORT.forEach(([pattern, what], order) => {
        for (const match of content.matchAll(pattern)) {
          found.push({ line: lineAt(content, match.index) + lineOffset, order, index: match.index, what: what ?? match[1] });
        }
      });
    }
    found.sort((x, y) => x.line - y.line || x.order - y.order || x.index - y.index);
    for (const { line, what } of found) problems.push(`${path.relative(root, file)}:${line}: ${what}`);
  }
  return problems;
}

/**
 * Pack backend code, by path from the pack's `src` root: feature backends and the feature-level
 * hooks module, migrations, and everything in `extensions/` but its frontend code (components,
 * `fe.ts` and `register-fe.ts` modules, the tiptap extensions, artifact viewers and block component
 * directories). Tests aren't checked.
 */
const PACK_BACKEND_PATH = /^(?:features\/[^/]+\/be\/|features\/hooks\.ts$|migrations\/|extensions\/)/;
const PACK_FRONTEND_PATH = /\.vue$|(?:^|\/)(?:fe|register-fe)\.ts$|^extensions\/(?:tiptap|artifacts\/viewers|blocks\/[^/]+)\/|(?:^|\/)__tests__\/|\.(?:spec|test)\.ts$/;

function isConsole(node: ts.Expression): boolean {
  while (ts.isParenthesizedExpression(node)) node = node.expression;
  if (ts.isIdentifier(node)) return node.text === 'console';
  // globalThis.console, global.console
  return ts.isPropertyAccessExpression(node) && node.name.text === 'console'
    && ts.isIdentifier(node.expression) && ['globalThis', 'global'].includes(node.expression.text);
}

/**
 * Console members code uses: `console.log`, `console?.log`, `console['log']`, `const { log } = console`.
 * It reads the syntax tree, so comments and the text of strings and template literals never match
 * (a URL like `https://console.anthropic.com`, or a prompt that mentions console.log, isn't a call),
 * while code inside `${…}` still does. The CLI's template strings, whose text is pack code, aren't
 * backend paths (see findPackBackendConsole).
 */
function consoleUses(code: string, fileName: string): { line: number; what: string }[] {
  const source = parse(code, fileName);
  const found: { line: number; what: string }[] = [];
  const add = (node: ts.Node, member: string) => found.push({ line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, what: `console.${member}` });
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAccessExpression(node) && isConsole(node.expression)) add(node, node.name.text);
    else if (ts.isElementAccessExpression(node) && isConsole(node.expression)) {
      add(node, ts.isStringLiteralLike(node.argumentExpression) ? node.argumentExpression.text : '[…]');
    } else if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name) && node.initializer && isConsole(node.initializer)) {
      for (const element of node.name.elements) {
        const key = element.propertyName ?? element.name;
        add(element, ts.isIdentifier(key) || ts.isStringLiteralLike(key) ? key.text : '[…]');
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/**
 * `file:line: console.<method>` for each console use in pack backend code (PACK_BACKEND_PATH),
 * which logs with `createLogger` from `@abuddy/sdk/logger` so its entries reach the app's log.
 * Frontend code and tests aren't checked, and neither are the CLI's own sources
 * (CLI_TEMPLATE_SOURCES): their console output is the CLI's, and the pack code in their templates is
 * text.
 */
export function findPackBackendConsole(dirs = PACK_SOURCE_DIRS, root = repoRoot): string[] {
  const problems: string[] = [];
  const files = dirs.filter((dir) => !CLI_TEMPLATE_SOURCES.includes(dir)).flatMap((dir) => {
    const full = path.join(root, dir);
    if (!fs.existsSync(full)) return [];
    if (fs.statSync(full).isFile()) throw new Error(`${dir}: backend console checks need a pack's src directory`);
    return [...sourceFiles(full)].filter((file) => {
      const relative = path.relative(full, file).split(path.sep).join('/');
      return PACK_BACKEND_PATH.test(relative) && !PACK_FRONTEND_PATH.test(relative);
    });
  });
  for (const file of files) {
    for (const { content, lineOffset } of codeBlocks(file)) {
      for (const { line, what } of consoleUses(content, file)) problems.push(`${path.relative(root, file)}:${line + lineOffset}: ${what}`);
    }
  }
  return problems;
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
