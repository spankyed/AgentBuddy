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
      helpers.push(text);
    }
  }

  return helpers.join('\n');
}

// --- Services parameter stripping ---

/**
 * Compute the source range to delete when removing one item from a
 * comma-separated list (parameters or arguments), including its comma.
 */
function computeRemovalRange(
  items: ts.NodeArray<ts.Node>,
  index: number,
): { start: number; end: number } | null {
  if (index < 0 || index >= items.length) return null;
  const target = items[index];
  if (items.length === 1) return { start: target.getStart(), end: target.getEnd() };
  // Not last → consume trailing comma; last → consume leading comma
  return index < items.length - 1
    ? { start: target.getStart(), end: items[index + 1].getStart() }
    : { start: items[index - 1].getEnd(), end: target.getEnd() };
}

/** Get the name and `services` param index for a function-like node, if any. */
function getFunctionServicesInfo(
  stmt: ts.Statement,
): { name: string; params: ts.NodeArray<ts.ParameterDeclaration>; idx: number } | null {
  // function foo(services, ...) {}
  if (ts.isFunctionDeclaration(stmt) && stmt.name) {
    const idx = stmt.parameters.findIndex(p => ts.isIdentifier(p.name) && p.name.text === 'services');
    if (idx >= 0) return { name: stmt.name.text, params: stmt.parameters, idx };
  }
  // var foo = (services, ...) => {} | var foo = function(services, ...) {}
  if (ts.isVariableStatement(stmt)) {
    for (const decl of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
      const init = decl.initializer;
      if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
        const idx = init.parameters.findIndex(p => ts.isIdentifier(p.name) && p.name.text === 'services');
        if (idx >= 0) return { name: decl.name.text, params: init.parameters, idx };
      }
    }
  }
  return null;
}

/** True if `name` only appears as a direct call or its own declaration (no value references). */
function isOnlyCalledDirectly(name: string, sourceFile: ts.SourceFile): boolean {
  let safe = true;
  function visit(node: ts.Node) {
    if (!safe) return;
    if (ts.isIdentifier(node) && node.text === name) {
      const p = node.parent;
      if (ts.isFunctionDeclaration(p) && p.name === node) return;          // own decl
      if (ts.isCallExpression(p) && p.expression === node) return;         // direct call
      if (ts.isPropertyAccessExpression(p) && p.name === node) return;     // obj.name
      safe = false;
    }
    ts.forEachChild(node, visit);
  }
  ts.forEachChild(sourceFile, visit);
  return safe;
}

/**
 * Strip redundant `services` parameters from inlined helper functions and
 * their call sites.  After inlining, `services` is already in the outer
 * scope (from `new AsyncFunction('params', 'services', body)`), so the
 * parameter just shadows the typed global and breaks Monaco intellisense.
 *
 * Functions referenced as values (e.g. dispatch tables) are left alone
 * because we can't update their indirect call sites.
 */
function stripServicesParam(code: string): string {
  const sourceFile = ts.createSourceFile('action.js', code, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);

  // Build map: functionName → services param index (only for directly-called helpers)
  const servicesMap = new Map<string, number>();
  for (const stmt of sourceFile.statements) {
    const info = getFunctionServicesInfo(stmt);
    if (info && isOnlyCalledDirectly(info.name, sourceFile)) {
      servicesMap.set(info.name, info.idx);
    }
  }
  if (servicesMap.size === 0) return code;

  // Collect edit ranges: parameter removals + call-site argument removals
  const edits: { start: number; end: number }[] = [];

  for (const stmt of sourceFile.statements) {
    const info = getFunctionServicesInfo(stmt);
    if (info && servicesMap.has(info.name)) {
      const range = computeRemovalRange(info.params, info.idx);
      if (range) edits.push(range);
    }
  }

  function collectCallEdits(node: ts.Node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const idx = servicesMap.get(node.expression.text);
      if (idx !== undefined && node.arguments.length > idx) {
        const range = computeRemovalRange(node.arguments, idx);
        if (range) edits.push(range);
      }
    }
    ts.forEachChild(node, collectCallEdits);
  }
  ts.forEachChild(sourceFile, collectCallEdits);

  // Apply edits in reverse order to preserve positions
  edits.sort((a, b) => b.start - a.start);
  let result = code;
  for (const { start, end } of edits) {
    result = result.substring(0, start) + result.substring(end);
  }
  return result;
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

  // Assemble function body = helpers + body, then strip redundant `services`
  // params from inlined helpers (services is already in scope from the outer
  // AsyncFunction wrapper, and keeping the param shadows the typed global).
  const rawFnBody = inlinedHelpers
    ? `${inlinedHelpers}\n\n${body}`
    : body;
  const fnBody = stripServicesParam(rawFnBody);

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
