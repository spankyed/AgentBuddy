import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';

/** Check generated entries as data; importing a pack here would activate it during publication. */
export function generatedDeclarationProblems(root: string, revision: string, frontend: boolean): string[] {
  const entries = ['pack-entry.ts', ...(frontend ? ['pack-entry-fe.ts'] : [])];
  return entries.flatMap(entry => {
    const file = path.join(root, 'src', '__generated__', entry);
    if (!fs.existsSync(file)) return [`${entry} is missing; run apack pack generate-entries`];
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf-8'), ts.ScriptTarget.Latest, true);
    let binding: ts.Expression | undefined;
    for (const statement of source.statements) {
      if (ts.isExportAssignment(statement)) binding = statement.expression;
      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (ts.isIdentifier(declaration.name) && declaration.name.text === 'registration') binding = declaration.initializer;
        }
      }
    }
    while (binding && (ts.isSatisfiesExpression(binding) || ts.isAsExpression(binding) || ts.isParenthesizedExpression(binding))) binding = binding.expression;
    const identity = binding && ts.isObjectLiteralExpression(binding)
      ? binding.properties.find(property => ts.isPropertyAssignment(property)
        && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) && property.name.text === 'declarationRevision')
      : undefined;
    if (identity && ts.isPropertyAssignment(identity) && ts.isStringLiteral(identity.initializer) && identity.initializer.text === revision) return [];
    return [`${entry} does not match the manifest; run apack pack generate-entries before building with --skip-generate`];
  });
}
