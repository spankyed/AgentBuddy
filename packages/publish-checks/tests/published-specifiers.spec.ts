import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { packagesBuiltOrRefuse, REPO_ROOT } from '@abuddy/host/build/packages-built';

/** Skips without built packages, and refuses rather than reading a stale `dist` */
const PACKAGES_BUILT = packagesBuiltOrRefuse('npm run packages:build (or npm test -w @app/publish-checks, which builds them)');

/**
 * Sources import `./x.ts`; the published JS must name the emitted `./x.js` (tsc's
 * rewriteRelativeImportExtensions for @abuddy/sdk, tsdown for @abuddy/ui, esbuild for the CLI
 * and testing bundles that inline @abuddy/host).
 */
const OUTPUTS = ['packages/abuddy-sdk/dist', 'packages/abuddy-ui/dist', 'packages/abuddy-cli/dist/package/dist', 'packages/abuddy-testing/dist/package/dist'];

/**
 * A module's own specifiers, from the parser rather than from the text.
 *
 * This reads the AST because the text is full of specifier-shaped strings that are not specifiers:
 * `generate-entries` emits pack code, so its template literals carry the `./ears.ts` imports the
 * *generated* pack will have — correct there, since a pack's own modules name the `.ts` file that is
 * there — and a regex over the file reported both it and the CLI bundle that inlines it. A parser
 * cannot make that mistake: a string inside a template literal is not a module specifier.
 */
function ownSpecifiers(source: string, file: string): string[] {
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.ESNext, false, ts.ScriptKind.JS);
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      found.push(node.moduleSpecifier.text);
    }
    const [firstArg] = ts.isCallExpression(node) ? node.arguments : [];
    if (firstArg && ts.isStringLiteral(firstArg) && ts.isCallExpression(node)
      && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
      found.push(firstArg.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return found;
}

const isRelativeTs = (specifier: string): boolean => /^\.{1,2}\//.test(specifier) && /\.(ts|tsx|mts|cts)$/.test(specifier);

describe.skipIf(!PACKAGES_BUILT)('published JS', () => {
  it.each(OUTPUTS)('has no relative .ts specifier in %s', (output) => {
    const dir = path.join(REPO_ROOT, output);
    const offenders = fs.readdirSync(dir, { recursive: true, encoding: 'utf-8' })
      .filter((file) => /\.(js|mjs|cjs)$/.test(file))
      .filter((file) => ownSpecifiers(fs.readFileSync(path.join(dir, file), 'utf-8'), file).some(isRelativeTs));
    expect(offenders).toEqual([]);
  });
});
