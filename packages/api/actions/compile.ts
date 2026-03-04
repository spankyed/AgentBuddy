import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';
import * as esbuild from 'esbuild';

// --- Constants ---

const DEFAULTS_DIR = path.join(import.meta.dirname, 'defaults');
const OUTPUT_FILE = path.join(import.meta.dirname, 'compiled-actions.json');

const DISALLOWED_NODE_PATTERNS = [
  { pattern: /\brequire\s*\(/, label: 'require()' },
  { pattern: /\bprocess\b/, label: 'process' },
  { pattern: /\b__dirname\b/, label: '__dirname' },
  { pattern: /\b__filename\b/, label: '__filename' },
  { pattern: /\bBuffer\b/, label: 'Buffer' },
  { pattern: /\bglobal\b/, label: 'global' },
];

// --- Interfaces ---

interface CompiledAction {
  label: string;
  description?: string;
  category?: string;
  input: Record<string, any>;
  actionFn: string;
  output?: any;
}

// --- esbuild Plugin ---

function createActionValidatorPlugin(entryFilePath: string): esbuild.Plugin {
  return {
    name: 'action-validator',
    setup(build) {
      // Block bare package imports (e.g. 'lodash', 'fs')
      build.onResolve({ filter: /^[^./]/ }, (args) => ({
        errors: [{ text: `Bare package imports are disallowed: '${args.path}'` }],
      }));

      // Block non-type imports from helper files
      // esbuild strips `import type` before resolution, so any onResolve call
      // from a non-entry file means a helper has a non-type import
      build.onResolve({ filter: /^\./ }, (args) => {
        if (args.importer && args.importer !== entryFilePath) {
          return {
            errors: [{ text: `Helper file cannot have non-type imports (found: '${args.path}' in ${path.relative(path.dirname(entryFilePath), args.importer)})` }],
          };
        }
        return undefined; // let esbuild resolve normally
      });
    },
  };
}

// --- Bundling ---

async function bundleActionFile(filePath: string): Promise<{ bundledJs: string; errors: string[] }> {
  try {
    const result = await esbuild.build({
      entryPoints: [filePath],
      bundle: true,
      write: false,
      format: 'esm',
      target: 'es2022',
      platform: 'neutral',
      plugins: [createActionValidatorPlugin(filePath)],
    });

    const errors: string[] = [];
    for (const err of result.errors) {
      errors.push(err.text);
    }
    for (const warn of result.warnings) {
      errors.push(warn.text);
    }

    if (errors.length > 0 || result.outputFiles.length === 0) {
      return { bundledJs: '', errors };
    }

    return { bundledJs: result.outputFiles[0].text, errors: [] };
  } catch (e: any) {
    // esbuild throws on build errors — extract messages
    const errors: string[] = [];
    if (e.errors) {
      for (const err of e.errors) {
        errors.push(err.text);
      }
    } else {
      errors.push(e.message || String(e));
    }
    return { bundledJs: '', errors };
  }
}

// --- Validation ---

function validateBundledOutput(bundledJs: string, filePath: string): string[] {
  const errors: string[] = [];
  for (const { pattern, label } of DISALLOWED_NODE_PATTERNS) {
    if (pattern.test(bundledJs)) {
      errors.push(`${filePath}: contains disallowed pattern: ${label}`);
    }
  }
  return errors;
}

// --- TS AST Extraction ---

function extractMeta(jsSource: string): Record<string, any> | null {
  const sourceFile = ts.createSourceFile('temp.js', jsSource, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);

  for (const statement of sourceFile.statements) {
    // esbuild outputs `var meta = {...}` — find by name, no export keyword check
    if (ts.isVariableStatement(statement)) {
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
    // esbuild outputs `async function action(...)` — find by name, no export keyword check
    if (
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === 'action' &&
      statement.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword) &&
      statement.body
    ) {
      // Get the text between the outermost braces
      const bodyText = jsSource.substring(statement.body.getStart() + 1, statement.body.getEnd() - 1);

      // Dedent: find minimum indentation and remove it
      const lines = bodyText.split('\n');
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

function extractInlinedHelpers(jsSource: string): string {
  const sourceFile = ts.createSourceFile('temp.js', jsSource, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
  const helpers: string[] = [];

  for (const statement of sourceFile.statements) {
    // Skip the meta variable declaration
    if (ts.isVariableStatement(statement)) {
      const hasMeta = statement.declarationList.declarations.some(
        d => ts.isIdentifier(d.name) && d.name.text === 'meta'
      );
      if (hasMeta) continue;
    }

    // Skip the action function declaration
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === 'action') {
      continue;
    }

    // Skip export statements (e.g. `export { meta, action }`)
    if (ts.isExportDeclaration(statement)) {
      continue;
    }

    // Everything else is an inlined helper
    const text = jsSource.substring(statement.getStart(), statement.getEnd()).trim();
    if (text) {
      helpers.push(text);
    }
  }

  return helpers.join('\n');
}

// --- Compilation ---

async function compileActionFile(filePath: string): Promise<{ action: CompiledAction | null; warnings: string[] }> {
  const relativePath = path.relative(DEFAULTS_DIR, filePath);

  // Bundle with esbuild (handles TS→JS + import resolution)
  const { bundledJs, errors: bundleErrors } = await bundleActionFile(filePath);
  if (bundleErrors.length > 0) {
    return { action: null, warnings: bundleErrors.map(e => `${relativePath}: ${e}`) };
  }

  // Validate bundled output for disallowed Node.js patterns
  const warnings = validateBundledOutput(bundledJs, relativePath);

  // Extract meta
  const meta = extractMeta(bundledJs);
  if (!meta) {
    return { action: null, warnings: [...warnings, `${relativePath}: could not extract meta object`] };
  }

  // Extract function body
  const body = extractFunctionBody(bundledJs);
  if (body === null) {
    return { action: null, warnings: [...warnings, `${relativePath}: could not extract action function body`] };
  }

  // Extract inlined helper declarations
  const inlinedHelpers = extractInlinedHelpers(bundledJs);

  // Assemble actionFn = helpers + body
  const actionFn = inlinedHelpers
    ? `${inlinedHelpers}\n\n${body}`
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

async function main() {
  console.log('Compiling actions from:', DEFAULTS_DIR);

  if (!fs.existsSync(DEFAULTS_DIR)) {
    console.error('Defaults directory not found:', DEFAULTS_DIR);
    process.exit(1);
  }

  const allFiles = fs.readdirSync(DEFAULTS_DIR).filter(f => f.endsWith('.ts')).sort();

  // Separate action files (have `export const meta`) from helper files
  const META_RE = /^export\s+const\s+meta\b/m;
  const actionFiles: string[] = [];
  const helperFiles: string[] = [];
  for (const file of allFiles) {
    const content = fs.readFileSync(path.join(DEFAULTS_DIR, file), 'utf-8');
    if (META_RE.test(content)) {
      actionFiles.push(file);
    } else {
      helperFiles.push(file);
    }
  }

  console.log(`Found ${actionFiles.length} action file(s): ${actionFiles.join(', ')}`);
  if (helperFiles.length > 0) {
    console.log(`Found ${helperFiles.length} helper file(s): ${helperFiles.join(', ')}`);
  }

  const allWarnings: string[] = [];
  const compiledActions: CompiledAction[] = [];

  for (const file of actionFiles) {
    const filePath = path.join(DEFAULTS_DIR, file);
    const { action, warnings } = await compileActionFile(filePath);
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

main().catch(err => {
  console.error('Compilation failed:', err);
  process.exit(1);
});
