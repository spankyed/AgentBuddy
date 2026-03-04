import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

// --- Constants ---

const DEFAULTS_DIR = path.join(import.meta.dirname, 'defaults');
const SHARED_DIR = path.join(import.meta.dirname, 'shared');
const OUTPUT_FILE = path.join(import.meta.dirname, 'compiled-actions.json');

const DISALLOWED_NODE_PATTERNS = [
  { pattern: /\brequire\s*\(/, label: 'require()' },
  { pattern: /\bprocess\b/, label: 'process' },
  { pattern: /\b__dirname\b/, label: '__dirname' },
  { pattern: /\b__filename\b/, label: '__filename' },
  { pattern: /\bBuffer\b/, label: 'Buffer' },
  { pattern: /\bglobal\b/, label: 'global' },
];

// Cache transpiled shared files per compilation run
const sharedFileCache = new Map<string, string>();

// --- Interfaces ---

interface SharedImportResult {
  cleanedSource: string;
  sharedDeclarations: string;
  errors: string[];
}

interface CompiledAction {
  label: string;
  description?: string;
  category?: string;
  input: Record<string, any>;
  actionFn: string;
  output?: any;
}

// --- Helpers ---

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

function validateSource(source: string, filePath: string, kind: 'action' | 'shared'): string[] {
  const errors: string[] = [];
  for (const line of source.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
    if (/^import\s+type\b/.test(trimmed)) continue;
    if (/^import\b/.test(trimmed)) {
      if (kind === 'action') {
        if (/from\s+['"]\.\.\/types['"]/.test(trimmed)) continue;
        if (/from\s+['"]\.\.\/shared\//.test(trimmed)) continue;
        errors.push(`${filePath}: disallowed non-type import: ${trimmed}`);
      } else {
        errors.push(`${filePath}: shared files cannot have imports (found: ${trimmed})`);
      }
    }
  }
  for (const { pattern, label } of DISALLOWED_NODE_PATTERNS) {
    if (pattern.test(source)) {
      errors.push(`${filePath}: contains disallowed pattern: ${label}`);
    }
  }
  return errors;
}

function extractNamedExports(jsSource: string, requestedNames: string[]): { declarations: string; missing: string[] } {
  const sourceFile = ts.createSourceFile('shared.js', jsSource, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
  const found = new Map<string, string>();

  for (const stmt of sourceFile.statements) {
    const isExported = ts.canHaveModifiers(stmt) &&
      ts.getModifiers(stmt)?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
    if (!isExported) continue;

    const names: string[] = [];
    if ((ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt)) && stmt.name) {
      names.push(stmt.name.text);
    } else if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) names.push(decl.name.text);
      }
    }

    for (const name of names) {
      if (requestedNames.includes(name)) {
        found.set(name, jsSource.substring(stmt.getStart(), stmt.getEnd()).replace(/^export\s+/, ''));
      }
    }
  }

  const missing = requestedNames.filter(n => !found.has(n));
  // Preserve import order
  const declarations = requestedNames
    .filter(n => found.has(n))
    .map(n => found.get(n)!)
    .join('\n');

  return { declarations, missing };
}

function resolveSharedImports(source: string, filePath: string): SharedImportResult {
  const errors: string[] = [];
  const allDeclarations: string[] = [];

  // Matches: import { foo, bar } from '../shared/xyz';
  const SHARED_IMPORT_RE = /^import\s*\{([^}]+)\}\s*from\s*['"]\.\.\/shared\/([^'"]+)['"]\s*;?\s*$/gm;

  let match: RegExpExecArray | null;
  const importLines: string[] = [];

  while ((match = SHARED_IMPORT_RE.exec(source)) !== null) {
    const namesRaw = match[1];
    const moduleName = match[2];
    importLines.push(match[0]);

    // Parse imported names — reject aliases
    const names: string[] = [];
    for (const part of namesRaw.split(',')) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      if (trimmed.includes(' as ')) {
        errors.push(`${filePath}: import aliases not supported: ${trimmed}`);
        continue;
      }
      names.push(trimmed);
    }

    if (names.length === 0) continue;

    // Resolve shared file
    const sharedFileName = moduleName.endsWith('.ts') ? moduleName : `${moduleName}.ts`;
    const sharedFilePath = path.join(SHARED_DIR, sharedFileName);

    if (!fs.existsSync(sharedFilePath)) {
      errors.push(`${filePath}: shared file not found: shared/${sharedFileName}`);
      continue;
    }

    // Read and validate shared source
    let sharedJs: string;
    if (sharedFileCache.has(sharedFilePath)) {
      sharedJs = sharedFileCache.get(sharedFilePath)!;
    } else {
      const sharedSource = fs.readFileSync(sharedFilePath, 'utf-8');
      const relPath = `shared/${sharedFileName}`;

      // Validate shared source (stricter rules)
      const validationErrors = validateSource(sharedSource, relPath, 'shared');
      if (validationErrors.length > 0) {
        errors.push(...validationErrors);
        continue;
      }

      sharedJs = transpileSource(sharedSource);
      sharedFileCache.set(sharedFilePath, sharedJs);
    }

    // Extract requested declarations
    const { declarations, missing } = extractNamedExports(sharedJs, names);

    for (const m of missing) {
      errors.push(`${filePath}: export '${m}' not found in shared/${sharedFileName}`);
    }

    if (declarations) {
      allDeclarations.push(declarations);
    }
  }

  // Remove shared import lines from source
  let cleanedSource = source;
  for (const line of importLines) {
    cleanedSource = cleanedSource.replace(line, '');
  }

  return {
    cleanedSource,
    sharedDeclarations: allDeclarations.join('\n\n'),
    errors,
  };
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

// --- Compilation ---

function compileActionFile(filePath: string): { action: CompiledAction | null; warnings: string[] } {
  const source = fs.readFileSync(filePath, 'utf-8');
  const relativePath = path.relative(DEFAULTS_DIR, filePath);

  // Resolve shared imports (before validation)
  const { cleanedSource, sharedDeclarations, errors: sharedErrors } = resolveSharedImports(source, relativePath);
  if (sharedErrors.length > 0) {
    return { action: null, warnings: sharedErrors };
  }

  const warnings = validateSource(cleanedSource, relativePath, 'action');

  // Transpile TS -> JS
  const jsSource = transpileSource(cleanedSource);

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

  // Prepend shared declarations to the function body
  const actionFn = sharedDeclarations
    ? `${sharedDeclarations}\n\n${body}`
    : body;

  const compiled: CompiledAction = {
    label: meta.label,
    ...(meta.description && { description: meta.description }),
    ...(meta.category && { category: meta.category }),
    input: meta.input || {},
    actionFn,
    ...(meta.output && { output: meta.output }),
  };

  return { action: compiled, warnings };
}

function main() {
  sharedFileCache.clear();
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
