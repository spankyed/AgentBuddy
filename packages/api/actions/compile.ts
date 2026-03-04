import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

const DEFAULTS_DIR = path.join(import.meta.dirname, 'defaults');
const OUTPUT_FILE = path.join(import.meta.dirname, 'compiled-actions.json');

// Patterns disallowed in action source (non-type imports, Node globals)
const DISALLOWED_PATTERNS = [
  { pattern: /^import\s+(?!type\b).*(?<!from\s+['"]\.\.\/types['"])\s*;?\s*$/gm, label: 'non-type import (except from ../types)' },
  { pattern: /\brequire\s*\(/g, label: 'require()' },
  { pattern: /\bprocess\b/g, label: 'process' },
  { pattern: /\b__dirname\b/g, label: '__dirname' },
  { pattern: /\b__filename\b/g, label: '__filename' },
  { pattern: /\bBuffer\b/g, label: 'Buffer' },
  { pattern: /\bglobal\b/g, label: 'global' },
];

interface CompiledAction {
  label: string;
  description?: string;
  category?: string;
  input: Record<string, any>;
  actionFn: string;
  output?: any;
}

function validateSource(source: string, filePath: string): string[] {
  const warnings: string[] = [];

  // Check for import lines — skip type-only imports and the ../types import
  const lines = source.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    // Skip empty, comments, type-only imports, and the types import
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
    if (/^import\s+type\b/.test(trimmed)) continue;
    if (/^import\b/.test(trimmed) && /from\s+['"]\.\.\/types['"]/.test(trimmed)) continue;
    if (/^import\b/.test(trimmed)) {
      warnings.push(`${filePath}: disallowed non-type import: ${trimmed}`);
    }
  }

  // Check for Node globals (skip in string literals and comments for simplicity)
  for (const { pattern, label } of DISALLOWED_PATTERNS.slice(1)) {
    // Reset lastIndex for global regexes
    pattern.lastIndex = 0;
    if (pattern.test(source)) {
      warnings.push(`${filePath}: contains disallowed pattern: ${label}`);
    }
  }

  return warnings;
}

function transpileSource(source: string): string {
  const result = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      removeComments: false,
    },
  });
  return result.outputText;
}

function extractMeta(jsSource: string): Record<string, any> | null {
  const sourceFile = ts.createSourceFile('temp.js', jsSource, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);

  for (const statement of sourceFile.statements) {
    // Look for: export const meta = { ... }
    if (
      ts.isVariableStatement(statement) &&
      statement.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      for (const decl of statement.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.name.text === 'meta' && decl.initializer) {
          if (ts.isObjectLiteralExpression(decl.initializer)) {
            const objectText = jsSource.substring(decl.initializer.pos, decl.initializer.end).trim();
            try {
              const fn = new Function('return (' + objectText + ')');
              return fn();
            } catch (e) {
              console.error('Failed to evaluate meta object:', e);
              return null;
            }
          }
        }
      }
    }
  }
  return null;
}

function extractFunctionBody(jsSource: string): string | null {
  const sourceFile = ts.createSourceFile('temp.js', jsSource, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);

  for (const statement of sourceFile.statements) {
    if (
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === 'action' &&
      statement.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) &&
      statement.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword) &&
      statement.body
    ) {
      // Get the text between the outermost braces
      const bodyText = jsSource.substring(statement.body.getStart() + 1, statement.body.getEnd() - 1);

      // Dedent: find minimum indentation and remove it
      const lines = bodyText.split('\n');
      // Filter out empty lines for indent calculation
      const nonEmptyLines = lines.filter(l => l.trim().length > 0);
      if (nonEmptyLines.length === 0) return '';

      const minIndent = Math.min(...nonEmptyLines.map(l => {
        const match = l.match(/^(\s*)/);
        return match ? match[1].length : 0;
      }));

      const dedented = lines
        .map(l => l.length >= minIndent ? l.substring(minIndent) : l)
        .join('\n')
        .trim();

      return dedented;
    }
  }
  return null;
}

function compileActionFile(filePath: string): { action: CompiledAction | null; warnings: string[] } {
  const source = fs.readFileSync(filePath, 'utf-8');
  const relativePath = path.relative(DEFAULTS_DIR, filePath);
  const warnings = validateSource(source, relativePath);

  // Transpile TS -> JS
  const jsSource = transpileSource(source);

  // Extract meta
  const meta = extractMeta(jsSource);
  if (!meta) {
    return { action: null, warnings: [...warnings, `${relativePath}: could not extract meta object`] };
  }

  // Extract function body
  const body = extractFunctionBody(jsSource);
  if (body === null) {
    return { action: null, warnings: [...warnings, `${relativePath}: could not extract action function body`] };
  }

  const compiled: CompiledAction = {
    label: meta.label,
    ...(meta.description && { description: meta.description }),
    ...(meta.category && { category: meta.category }),
    input: meta.input || {},
    actionFn: body,
    ...(meta.output && { output: meta.output }),
  };

  return { action: compiled, warnings };
}

function main() {
  console.log('Compiling actions from:', DEFAULTS_DIR);

  if (!fs.existsSync(DEFAULTS_DIR)) {
    console.error('Defaults directory not found:', DEFAULTS_DIR);
    process.exit(1);
  }

  const files = fs.readdirSync(DEFAULTS_DIR).filter(f => f.endsWith('.ts')).sort();
  console.log(`Found ${files.length} action file(s):`, files.join(', '));

  const allWarnings: string[] = [];
  const compiledActions: CompiledAction[] = [];

  for (const file of files) {
    const filePath = path.join(DEFAULTS_DIR, file);
    const { action, warnings } = compileActionFile(filePath);
    allWarnings.push(...warnings);
    if (action) {
      compiledActions.push(action);
      console.log(`  + ${action.label}`);
    } else {
      console.error(`  x ${file} — failed to compile`);
    }
  }

  if (allWarnings.length > 0) {
    console.log('\nWarnings:');
    for (const w of allWarnings) {
      console.warn(`  ! ${w}`);
    }
  }

  // Write output
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(compiledActions, null, 2) + '\n');
  console.log(`\nWrote ${compiledActions.length} action(s) to ${path.relative(process.cwd(), OUTPUT_FILE)}`);
}

main();
