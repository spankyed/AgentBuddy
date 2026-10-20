import path from 'node:path';
import ts from 'typescript';

/** Conservative namespaces for native import/require globs; esbuild still chooses the matches. */
export function compilerGlobDirectories(source: ts.SourceFile): string[] {
  const directories = new Set<string>();
  function prefix(node: ts.Expression): { text: string; complete: boolean } {
    if (ts.isParenthesizedExpression(node)) return prefix(node.expression);
    if (ts.isStringLiteralLike(node)) return { text: node.text, complete: true };
    if (ts.isTemplateExpression(node)) return { text: node.head.text, complete: false };
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const left = prefix(node.left);
      if (!left.complete) return left;
      const right = prefix(node.right);
      return { text: left.text + right.text, complete: right.complete };
    }
    return { text: '', complete: false };
  }
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && node.arguments.length === 1
      && (node.expression.kind === ts.SyntaxKind.ImportKeyword
        || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
      const value = prefix(node.arguments[0]!);
      if (!value.complete && /^\.\.?\//.test(value.text)) {
        const directory = value.text.endsWith('/') ? value.text : path.dirname(value.text);
        directories.add(path.resolve(path.dirname(source.fileName), directory));
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return [...directories];
}
