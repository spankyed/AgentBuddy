import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import ts from 'typescript';
import * as esbuild from 'esbuild';

// --- Constants ---

const DISALLOWED_NODE_PATTERNS = [
  { pattern: /\brequire\s*\(/, label: 'require()' },
  { pattern: /\bprocess\b/, label: 'process' },
  { pattern: /\b__dirname\b/, label: '__dirname' },
  { pattern: /\b__filename\b/, label: '__filename' },
  { pattern: /\bBuffer\b/, label: 'Buffer' },
  { pattern: /\bglobal\b/, label: 'global' },
];

// --- Interfaces ---

export interface CompileConfig {
  sourceDir: string;
  outputFile: string;
  functionName: string;
  isAsync: boolean;
  fields: {
    metaInput: string;
    fnBody: string;
    output: string;
  };
}

// --- esbuild Plugin ---

function createValidatorPlugin(entryFilePath: string): esbuild.Plugin {
  return {
    name: 'source-validator',
    setup(build) {
      // Block bare package imports (e.g. 'lodash', 'fs')
      // Allow relative (./ ../) and absolute (/ or C:\) paths
      build.onResolve({ filter: /^[^./]/ }, (args) => {
        if (/^[a-zA-Z]:/.test(args.path)) return undefined;
        return {
          errors: [{ text: `Bare package imports are disallowed: '${args.path}'` }],
        };
      });

    },
  };
}

// --- Bundling ---

async function bundleFile(filePath: string): Promise<{ bundledJs: string; errors: string[] }> {
  try {
    const result = await esbuild.build({
      entryPoints: [filePath],
      bundle: true,
      write: false,
      format: 'esm',
      target: 'es2022',
      platform: 'neutral',
      plugins: [createValidatorPlugin(filePath)],
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

function extractFunctionBody(jsSource: string, functionName: string, isAsync: boolean): string | null {
  const sourceFile = ts.createSourceFile('temp.js', jsSource, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);

  for (const statement of sourceFile.statements) {
    if (
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === functionName &&
      (!isAsync || statement.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword)) &&
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

function extractInlinedHelpers(jsSource: string, functionName: string): string {
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

    // Skip the main function declaration
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === functionName) {
      continue;
    }

    // Skip export statements (e.g. `export { meta, action }`)
    if (ts.isExportDeclaration(statement)) {
      continue;
    }

    // Everything else is an inlined helper
    const text = jsSource.substring(statement.getStart(), statement.getEnd()).trim();
    if (text) {
      // Add JSDoc @param for 'services' parameter in function declarations so
      // Monaco intellisense works when the helper is inlined into the action body
      // (esbuild strips TS type annotations, so without this the untyped parameter
      // shadows the globally-declared typed `services` and breaks autocomplete).
      if (
        ts.isFunctionDeclaration(statement) &&
        statement.parameters.some(p => ts.isIdentifier(p.name) && p.name.text === 'services')
      ) {
        helpers.push(`/** @param {import('@app/defs/action').Services} services */\n${text}`);
      } else {
        helpers.push(text);
      }
    }
  }

  return helpers.join('\n');
}

// --- File scanning ---

function scanSourceFiles(dir: string): { sourceFiles: string[]; helperFiles: string[] } {
  const META_RE = /^export\s+const\s+meta\b/m;
  const sourceFiles: string[] = [];
  const helperFiles: string[] = [];

  function walk(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        walk(path.join(currentDir, entry.name));
      } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.example.ts')) {
        const relativePath = path.relative(dir, path.join(currentDir, entry.name));
        const content = fs.readFileSync(path.join(currentDir, entry.name), 'utf-8');
        if (META_RE.test(content)) {
          sourceFiles.push(relativePath);
        } else {
          helperFiles.push(relativePath);
        }
      }
    }
  }

  walk(dir);
  sourceFiles.sort();
  helperFiles.sort();

  return { sourceFiles, helperFiles };
}

// --- Per-file compilation ---

async function compileSourceFile(
  filePath: string,
  sourceDir: string,
  config: CompileConfig,
): Promise<{ entry: Record<string, any> | null; warnings: string[] }> {
  const relativePath = path.relative(sourceDir, filePath);

  // Bundle with esbuild (handles TS→JS + import resolution)
  const { bundledJs, errors: bundleErrors } = await bundleFile(filePath);
  if (bundleErrors.length > 0) {
    return { entry: null, warnings: bundleErrors.map(e => `${relativePath}: ${e}`) };
  }

  // Validate bundled output for disallowed Node.js patterns
  const warnings = validateBundledOutput(bundledJs, relativePath);

  // Extract meta
  const meta = extractMeta(bundledJs);
  if (!meta) {
    return { entry: null, warnings: [...warnings, `${relativePath}: could not extract meta object`] };
  }

  // Extract function body
  const body = extractFunctionBody(bundledJs, config.functionName, config.isAsync);
  if (body === null) {
    return { entry: null, warnings: [...warnings, `${relativePath}: could not extract ${config.functionName} function body`] };
  }

  // Extract inlined helper declarations
  const inlinedHelpers = extractInlinedHelpers(bundledJs, config.functionName);

  // Assemble function body = helpers + body
  const fnBody = inlinedHelpers
    ? `${inlinedHelpers}\n\n${body}`
    : body;

  const compiled: Record<string, any> = {
    label: meta.label,
    ...(meta.description && { description: meta.description }),
    ...(meta.category && { category: meta.category }),
    [config.fields.metaInput]: meta[config.fields.metaInput] || {},
    [config.fields.fnBody]: fnBody,
    ...(meta[config.fields.output] && { [config.fields.output]: meta[config.fields.output] }),
  };

  // Compute per-item sourceHash so the seed logic can detect DSL changes
  const sourceHash = crypto.createHash('sha256')
    .update(JSON.stringify(compiled))
    .digest('hex')
    .slice(0, 16);

  return { entry: { ...compiled, sourceHash }, warnings };
}

// --- Main compilation loop ---

export async function compileAllSourceFiles(config: CompileConfig): Promise<void> {
  const baseDir = path.resolve(import.meta.dirname, '..');
  const sourceDir = path.join(baseDir, config.sourceDir);
  const outputFile = path.join(baseDir, config.outputFile);

  console.log(`Compiling from: ${sourceDir}`);

  if (!fs.existsSync(sourceDir)) {
    console.log(`Source directory not found: ${sourceDir}`);
    console.log(`\nWrote 0 entries to ${config.outputFile}\n`);
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    fs.writeFileSync(outputFile, JSON.stringify([], null, 2));
    return;
  }

  const { sourceFiles, helperFiles } = scanSourceFiles(sourceDir);

  console.log(`Found ${sourceFiles.length} source file(s): ${sourceFiles.join(', ')}`);
  if (helperFiles.length > 0) {
    console.log(`Found ${helperFiles.length} helper file(s): ${helperFiles.join(', ')}`);
  }

  const allWarnings: string[] = [];
  const compiledEntries: Record<string, any>[] = [];

  for (const file of sourceFiles) {
    const filePath = path.join(sourceDir, file);
    const { entry, warnings } = await compileSourceFile(filePath, sourceDir, config);
    allWarnings.push(...warnings);
    if (entry) {
      compiledEntries.push(entry);
      console.log(`  + ${entry.label}`);
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

  // Write output (ensure parent directory exists)
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(compiledEntries, null, 2) + '\n');
  console.log(`\nWrote ${compiledEntries.length} entries to ${path.relative(process.cwd(), outputFile)}`);
}
