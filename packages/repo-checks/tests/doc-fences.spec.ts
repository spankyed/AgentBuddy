import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '@abuddy/host/build/packages-built';

/**
 * A code fence in the pack-facing guides names a pack's own modules the way a pack must: with the extension.
 *
 * These fences are copied. `abuddy build` refuses an own-module specifier that names no file
 * (`docs/archive/goals/goal-pack-imports-name-the-file.md`), so a guide showing
 * `import { services } from '#generated/services'` hands the reader a pack that will not build — and the
 * only thing that told us was reading the docs afterwards: 32 of them said it, in five files, a day after
 * the rule landed.
 *
 * There is no pack here to resolve against, so the rule is the extension alone — the same rule
 * `check:specifiers` applies to the CLI's templates, which are pack code in a string for the same reason.
 *
 * No chain step declares `docs/`, deliberately (a doc edit runs nothing), so like `doc-links.spec.ts` this
 * bites on the next run of this suite rather than at the moment of the edit. Making it immediate means
 * declaring `docs/public-facing` an input of the step that runs this, which trades the repo's cheapest
 * property for it — worth doing only if a stale fence ever survives long enough to reach someone.
 */
const GUIDES = path.join(REPO_ROOT, 'docs', 'public-facing');
/** The fences whose contents are code someone pastes into a pack */
const CODE_FENCE = /```(ts|tsx|typescript|js|vue)\n([\s\S]*?)```/g;
/** A pack's own module: its `#` subpath imports, or a sibling by relative path */
const ownModule = (specifier: string) => specifier.startsWith('#') || specifier.startsWith('./') || specifier.startsWith('../');

/** Every module specifier in one fence, from the parser: a `#generated/x` inside a string is not an import */
function specifiers(code: string, fence: string): { text: string; line: number }[] {
  const source = ts.createSourceFile(fence, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const found: { text: string; line: number }[] = [];
  const visit = (node: ts.Node): void => {
    const literal = (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) ? node.moduleSpecifier
      : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0]) ? node.arguments[0]
      : undefined;
    if (literal && ts.isStringLiteralLike(literal)) {
      found.push({ text: literal.text, line: source.getLineAndCharacterOfPosition(literal.getStart(source)).line + 1 });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** A `vue` fence's `<script>` contents, with the line each block starts on (less one); any other fence whole */
function blocks(language: string, code: string): { content: string; lineOffset: number }[] {
  if (language !== 'vue') return [{ content: code, lineOffset: 0 }];
  return [...code.matchAll(/<script[^>]*>\n([\s\S]*?)<\/script>/g)].map((match) => ({
    content: match[1] as string,
    lineOffset: code.slice(0, match.index).split('\n').length,
  }));
}

export function extensionlessInFences(dir = GUIDES, root = REPO_ROOT): string[] {
  const problems: string[] = [];
  for (const file of fs.readdirSync(dir, { recursive: true, encoding: 'utf-8' })) {
    if (!file.endsWith('.md')) continue;
    const full = path.join(dir, file);
    if (!fs.statSync(full).isFile()) continue;
    const markdown = fs.readFileSync(full, 'utf-8');
    for (const fence of markdown.matchAll(CODE_FENCE)) {
      const at = markdown.slice(0, fence.index).split('\n').length;
      for (const { content, lineOffset } of blocks(fence[1] as string, fence[2] as string)) {
        for (const { text, line } of specifiers(content, full)) {
          if (ownModule(text) && path.extname(text) === '') {
            problems.push(`${path.relative(root, full).split(path.sep).join('/')}:${at + lineOffset + line}: ${text}`);
          }
        }
      }
    }
  }
  return problems;
}

describe('the pack-facing guides', () => {
  it('show own-module specifiers that name a file, since a reader pastes them into a pack', () => {
    expect(extensionlessInFences(),
      "a guide shows an import abuddy build refuses: write the file's extension, as a pack must").toEqual([]);
  });

  it('reads an import from a fence and not from prose, a string or another language', () => {
    const dir = fs.mkdtempSync(path.join(REPO_ROOT, 'node_modules', '.cache', 'doc-fences-'));
    try {
      fs.writeFileSync(path.join(dir, 'a.md'), [
        'Prose naming `#generated/services` is not a fence.',
        '', '```ts', "const sample = 'code that mentions #generated/services';", '```',
        '', '```bash', "import { x } from '#generated/x'", '```',
        '', '```ts', "import { services } from '#generated/services';", '```',
        '', '```vue', '<template><div /></template>', '', '<script setup lang="ts">',
        "import { openPlugin } from '#generated/fe';", '</script>', '```',
        '', '```ts', "import { ok } from '#generated/ok.ts';", "import { dep } from '@abuddy/sdk';", '```',
      ].join('\n'));
      expect(extensionlessInFences(dir, dir)).toEqual(['a.md:12: #generated/services', 'a.md:19: #generated/fe']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
