// Reading a pack's sources: the files, an SFC's script blocks, and every module specifier in them. One reader
// for every rule in `pack-rules.ts` and for the repo's own `check:specifiers`, because they all ask the same
// question of the same files, and a second copy of "what does this file import" is a second thing to get wrong. `typescript` and `vue` are this package's dependencies, so a syntax tree costs
// nothing here: a string that looks like an import inside a comment or a template literal is not one, and no
// regex over the text can tell.
import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';
import { parse as parseSfc } from 'vue/compiler-sfc';
import type { OwnModuleSpecifier } from '@abuddy/host/build/own-module-specifiers';

/**
 * A pack's source: TypeScript, JavaScript and SFCs. `.d.ts` declares, and imports nothing of the pack's.
 *
 * JavaScript counts because a pack may be authored in it — `abuddy init` writes TypeScript, and nothing
 * requires a pack to. Leaving `.js` out meant the rules over a pack's sources simply did not apply to such a
 * pack, silently, which is the worse half of not supporting it.
 */
const SOURCE_FILE = /(?<!\.d)\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$|\.vue$/;

/** Every source file under `dir`, skipping `node_modules` and whatever else `skip` names by entry name */
export function* sourceFiles(dir: string, skip: (entryName: string) => boolean = () => false): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    // Dependencies and build output are not a pack's source, whoever walks: the repo's own rules used to have a
    // second walk that skipped neither, which is how a `node_modules` under a checked directory would have been
    // read as source — latent, since none sits under one today
    if (entry.name === 'node_modules' || entry.name === 'dist' || skip(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(full, skip);
    else if (entry.isFile() && SOURCE_FILE.test(entry.name)) yield full;
  }
}

/**
 * A file's code: the whole file, or a .vue file's `<script>` blocks.
 *
 * `lineOffset` is the line the block starts on, less one, and `offset` the character it starts at — so a
 * position inside a block becomes a position in the file, which is what a rewriter needs. No `pad` option is
 * passed, so `block.content[i]` is `code[offset + i]`; `pack-sources.spec.ts` asserts that rather than trusting
 * it, because every splice `specifiers:fix` makes rests on it.
 */
export function codeBlocks(file: string, code: string): { content: string; lineOffset: number; offset: number }[] {
  if (!file.endsWith('.vue')) return [{ content: code, lineOffset: 0, offset: 0 }];
  const { descriptor } = parseSfc(code, { filename: file });
  return [descriptor.script, descriptor.scriptSetup].filter((block) => block !== null)
    .map((block) => ({ content: block.content, lineOffset: block.loc.start.line - 1, offset: block.loc.start.offset }));
}

/** One block of a pack's code as a syntax tree, with positions, so a caller can report a line */
export function parseSource(file: string, content: string): ts.SourceFile {
  return ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true,
    /\.[jt]sx$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}

/** The module a static import or export, or a dynamic import(), names */
export function moduleOf(node: ts.Node): string | undefined {
  const literal = ts.isImportDeclaration(node) || ts.isExportDeclaration(node) ? node.moduleSpecifier
    : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword ? node.arguments[0] : undefined;
  return literal && ts.isStringLiteralLike(literal) ? literal.text : undefined;
}

/** Calls whose first argument is a module path, as `scripts/check-import-specifiers.ts` reads them too */
const MODULE_PATH_CALLS = /^(require|require\.resolve|(vi|jest)\.(mock|doMock|unmock|importActual|importMock))$/;

/**
 * Every module specifier in one block of code, in every form that names a module path.
 *
 * `start` and `end` are the literal's bounds **inside the quotes**, so a rewriter splices the specifier and
 * never the quote style. They are offsets into the block; `packSpecifiers` adds the block's own offset.
 */
function specifiersIn(source: ts.SourceFile): { text: string; line: number; start: number; end: number }[] {
  const found: { text: string; line: number; start: number; end: number }[] = [];
  const visit = (node: ts.Node): void => {
    let literal: ts.StringLiteralLike | undefined;
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) literal = node.moduleSpecifier;
    else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && ts.isStringLiteral(node.moduleReference.expression)) literal = node.moduleReference.expression;
    else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) literal = node.argument.literal;
    else if (ts.isCallExpression(node) && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])
      && (node.expression.kind === ts.SyntaxKind.ImportKeyword || MODULE_PATH_CALLS.test(node.expression.getText(source)))) {
      literal = node.arguments[0] as ts.StringLiteralLike;
    }
    if (literal) {
      found.push({
        text: literal.text,
        line: source.getLineAndCharacterOfPosition(literal.getStart(source)).line + 1,
        start: literal.getStart(source) + 1,
        end: literal.getEnd() - 1,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/**
 * Every specifier the pack's `dirs` name, with the file (relative to the pack) and line that wrote it.
 *
 * Generated files are included: `abuddy generate-entries` writes them and writes extensions, so one that
 * lacks them means the pack was generated by an older CLI, and saying so is more use than skipping it.
 */
export function packSpecifiers(packDir: string, dirs: readonly string[]): OwnModuleSpecifier[] {
  const found: OwnModuleSpecifier[] = [];
  for (const dir of dirs) {
    const root = path.join(packDir, dir);
    if (!fs.existsSync(root)) continue;
    // A directory or a single file: a caller naming one file should not read as a walk of it
    for (const file of fs.statSync(root).isFile() ? [root] : [...sourceFiles(root)]) {
      const where = path.relative(packDir, file).split(path.sep).join('/');
      const code = fs.readFileSync(file, 'utf-8');
      for (const { content, lineOffset, offset } of codeBlocks(file, code)) {
        for (const { text, line, start, end } of specifiersIn(parseSource(file, content))) {
          found.push({ file: where, line: line + lineOffset, specifier: text, start: start + offset, end: end + offset });
        }
      }
    }
  }
  return found;
}

/** One block of a file as a syntax tree, with what it takes to turn a position inside it into a file position */
export interface Block {
  readonly source: ts.SourceFile;
  readonly lineOffset: number;
  readonly offset: number;
}

/** A specifier as the reader found it: the line it is on, and its bounds in the file, inside the quotes */
export interface Specifier {
  readonly text: string;
  readonly line: number;
  readonly start: number;
  readonly end: number;
}

/** A file read and parsed once: its blocks, its specifiers, and a walk over every node of every block */
export interface SourceView {
  readonly file: string;
  readonly code: string;
  readonly blocks: readonly Block[];
  readonly specifiers: readonly Specifier[];
  /**
   * `rule` returns what it found at a node, or nothing. The line and the span are the file's, not the block's,
   * so a caller can tell two findings at one site from two findings on one line.
   */
  visit(rule: (node: ts.Node, source: ts.SourceFile) => string[] | undefined): { line: number; what: string; start: number; end: number }[];
}

/**
 * The cache that makes one pass over the tree one parse per file.
 *
 * Keyed by absolute path and never invalidated, because the processes that read sources — `abuddy build`,
 * `abuddy validate`, `check:specifiers` — read each file once and exit. A test over a temp tree reuses paths,
 * so it calls `resetSourceCache()` between trees.
 */
const views = new Map<string, SourceView>();

export function resetSourceCache(): void {
  views.clear();
}

export function readSource(file: string): SourceView {
  const seen = views.get(file);
  if (seen) return seen;
  const code = fs.readFileSync(file, 'utf-8');
  const blocks: Block[] = codeBlocks(file, code)
    .map(({ content, lineOffset, offset }) => ({ source: parseSource(file, content), lineOffset, offset }));
  const specifiers = blocks.flatMap(({ source, lineOffset, offset }) =>
    specifiersIn(source).map((found) => ({
      text: found.text,
      line: found.line + lineOffset,
      start: found.start + offset,
      end: found.end + offset,
    })));
  const view: SourceView = {
    file,
    code,
    blocks,
    specifiers,
    visit(rule) {
      const found: { line: number; what: string; start: number; end: number }[] = [];
      for (const { source, lineOffset, offset } of blocks) {
        const walk = (node: ts.Node): void => {
          for (const what of rule(node, source) ?? []) {
            found.push({
              line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 + lineOffset,
              what,
              start: node.getStart(source) + offset,
              end: node.getEnd() + offset,
            });
          }
          ts.forEachChild(node, walk);
        };
        walk(source);
      }
      return found.sort((a, b) => a.line - b.line);
    },
  };
  views.set(file, view);
  return view;
}

