import path from 'node:path';
import ts from 'typescript';
import type { Plugin } from 'vite';

/** Empty globs and variable imports also depend on directory membership. */
export function globWatchPlugin(root: string, directories: Set<string>): Plugin {
  return {
    name: 'apack-glob-inputs',
    async transform(code, id) {
      if (id.includes('\0') || (!code.includes('import.meta.glob') && !/\bimport\s*[(/]/.test(code))) return;
      // Runs after Vue and Vite's TS transform, before Vite expands glob expressions.
      const source = ts.createSourceFile(id, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
      const calls: ts.CallExpression[] = [];
      const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node)) {
          const expression = node.expression;
          const glob = ts.isPropertyAccessExpression(expression) && expression.name.text === 'glob'
            && ts.isMetaProperty(expression.expression) && expression.expression.keywordToken === ts.SyntaxKind.ImportKeyword;
          const dynamic = expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0]
            && ts.isTemplateExpression(node.arguments[0]) && !/\/\*\s*@vite-ignore\s*\*\//.test(node.getText(source));
          if (glob || dynamic) calls.push(node);
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
      const importer = path.dirname(id.replace(/[?#].*$/, ''));
      for (const call of calls) {
        const argument = call.arguments[0];
        if (!argument) continue; // Vite owns syntax diagnostics.
        if (ts.isTemplateExpression(argument)) {
          // Vite expands these after user plugins run. Observe the fixed prefix conservatively;
          // Vite still owns expansion, supported expressions and their diagnostics.
          const prefix = argument.head.text;
          if (/^\.{1,2}\//.test(prefix)) directories.add(path.dirname(path.resolve(importer, `${prefix}_`)));
          continue;
        }
        const patterns = ts.isArrayLiteralExpression(argument) ? argument.elements : [argument];
        const options = call.arguments[1];
        const base = options && ts.isObjectLiteralExpression(options) ? options.properties.find(
          property => ts.isPropertyAssignment(property)
            && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) && property.name.text === 'base',
        ) : undefined;
        const baseValue = base && ts.isPropertyAssignment(base) && ts.isStringLiteralLike(base.initializer)
          ? base.initializer.text : undefined;
        const relativeRoot = baseValue ? (baseValue.startsWith('/')
          ? path.join(root, baseValue) : path.resolve(importer, baseValue)) : importer;
        for (const pattern of patterns) {
          if (!ts.isStringLiteralLike(pattern) || pattern.text.startsWith('!')) continue;
          const glob = ts.isNoSubstitutionTemplateLiteral(pattern) ? pattern.rawText ?? pattern.text : pattern.text;
          let resolved: string | undefined;
          if (glob.startsWith('/')) resolved = path.join(root, glob);
          else if (glob.startsWith('./') || glob.startsWith('../')) resolved = path.resolve(relativeRoot, glob);
          else if (glob.startsWith('**')) resolved = path.resolve(root, glob);
          else resolved = (await this.resolve(glob, id, {
            custom: { 'vite:import-glob': { isSubImportsPattern: glob.startsWith('#') && glob.includes('*') } },
          }))?.id;
          if (!resolved || !path.isAbsolute(resolved)) continue;
          // Keep the static directory prefix; negatives filter matches, not subscription roots.
          const dynamic = resolved.search(/[*?{[(!]/);
          directories.add(path.dirname(dynamic < 0 ? resolved : `${resolved.slice(0, dynamic)}_`));
        }
      }
    },
  };
}
