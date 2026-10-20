import path from 'node:path';
import ts from 'typescript';
import MagicString from 'magic-string';

/** Keep native resolution/configuration intact by projecting only executable module references. */
export function compilerModuleReferences(file: string, text: string, readPath: (file: string) => string,
  prepare: (specifier: string) => void): string {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false);
  const output = new MagicString(text);
  function reference(node: ts.Expression | undefined) {
    if (!node || !ts.isStringLiteralLike(node) || !path.isAbsolute(node.text)) return;
    prepare(node.text);
    const relative = path.relative(path.dirname(file), readPath(node.text)).split(path.sep).join('/');
    output.overwrite(node.getStart(source), node.end, JSON.stringify(relative.startsWith('.') ? relative : `./${relative}`));
  }
  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) reference(node.moduleSpecifier);
    else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) reference(node.moduleReference.expression);
    else if (ts.isCallExpression(node) && node.arguments.length
      && (node.expression.kind === ts.SyntaxKind.ImportKeyword
        || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) reference(node.arguments[0]);
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (!output.hasChanged()) return text;
  const map = output.generateMap({ source: file, includeContent: true, hires: true });
  return `${output.toString()}\n//# sourceMappingURL=${map.toUrl()}\n`;
}
