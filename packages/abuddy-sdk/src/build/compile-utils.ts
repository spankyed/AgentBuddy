import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import ts from 'typescript';
import * as esbuild from 'esbuild';

const DISALLOWED_NODE_PATTERNS = [
  { pattern: /\brequire\s*\(/, label: 'require()' },
  { pattern: /\bprocess\b/, label: 'process' },
  { pattern: /\b__dirname\b/, label: '__dirname' },
  { pattern: /\b__filename\b/, label: '__filename' },
  { pattern: /\bBuffer\b/, label: 'Buffer' },
  { pattern: /\bglobal\b/, label: 'global' },
];

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

export interface CompiledEntry {
  label: string;
  description?: string;
  category?: string;
  sourceHash: string;
  [key: string]: any;
}

export interface CompileResult {
  entries: CompiledEntry[];
  warnings: string[];
}

// --- esbuild Plugin ---

function createValidatorPlugin(): esbuild.Plugin {
  return {
    name: 'source-validator',
    setup(build) {
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

export async function bundleFile(filePath: string): Promise<{ bundledJs: string; errors: string[] }> {
  try {
    const result = await esbuild.build({
      entryPoints: [filePath],
      bundle: true,
      write: false,
      format: 'esm',
      target: 'es2022',
      platform: 'neutral',
      plugins: [createValidatorPlugin()],
    });

    const errors: string[] = [];
    for (const err of result.errors) errors.push(err.text);
    for (const warn of result.warnings) errors.push(warn.text);

    if (errors.length > 0 || result.outputFiles.length === 0) {
      return { bundledJs: '', errors };
    }

    return { bundledJs: result.outputFiles[0].text, errors: [] };
  } catch (e: any) {
    const errors: string[] = [];
    if (e.errors) {
      for (const err of e.errors) errors.push(err.text);
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
    if (ts.isVariableStatement(statement)) {
      for (const decl of statement.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.name.text === 'meta' && decl.initializer) {
          if (ts.isObjectLiteralExpression(decl.initializer)) {
            const objectText = jsSource.substring(decl.initializer.pos, decl.initializer.end).trim();
            try {
              const fn = new Function('return (' + objectText + ')');
              return fn();
            } catch {
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
      const bodyText = jsSource.substring(statement.body.getStart() + 1, statement.body.getEnd() - 1);
      const lines = bodyText.split('\n');
      const nonEmptyLines = lines.filter(l => l.trim().length > 0);
      if (nonEmptyLines.length === 0) return '';

      const minIndent = Math.min(...nonEmptyLines.map(l => {
        const match = l.match(/^(\s*)/);
        return match ? match[1].length : 0;
      }));

      return lines
        .map(l => l.length >= minIndent ? l.substring(minIndent) : l)
        .join('\n')
        .trim();
    }
  }
  return null;
}

function extractInlinedHelpers(jsSource: string, functionName: string): string {
  const sourceFile = ts.createSourceFile('temp.js', jsSource, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
  const helpers: string[] = [];

  for (const statement of sourceFile.statements) {
    if (ts.isVariableStatement(statement)) {
      const hasMeta = statement.declarationList.declarations.some(
        d => ts.isIdentifier(d.name) && d.name.text === 'meta'
      );
      if (hasMeta) continue;
    }
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === functionName) continue;
    if (ts.isExportDeclaration(statement)) continue;

    const text = jsSource.substring(statement.getStart(), statement.getEnd()).trim();
    if (text) helpers.push(text);
  }

  return helpers.join('\n');
}

// --- Services parameter stripping ---

function computeRemovalRange(
  items: ts.NodeArray<ts.Node>,
  index: number,
): { start: number; end: number } | null {
  if (index < 0 || index >= items.length) return null;
  const target = items[index];
  if (items.length === 1) return { start: target.getStart(), end: target.getEnd() };
  return index < items.length - 1
    ? { start: target.getStart(), end: items[index + 1].getStart() }
    : { start: items[index - 1].getEnd(), end: target.getEnd() };
}

function getFunctionServicesInfo(
  stmt: ts.Statement,
): { name: string; params: ts.NodeArray<ts.ParameterDeclaration>; idx: number } | null {
  if (ts.isFunctionDeclaration(stmt) && stmt.name) {
    const idx = stmt.parameters.findIndex(p => ts.isIdentifier(p.name) && p.name.text === 'services');
    if (idx >= 0) return { name: stmt.name.text, params: stmt.parameters, idx };
  }
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

function isOnlyCalledDirectly(name: string, sourceFile: ts.SourceFile): boolean {
  let safe = true;
  function visit(node: ts.Node) {
    if (!safe) return;
    if (ts.isIdentifier(node) && node.text === name) {
      const p = node.parent;
      if (ts.isFunctionDeclaration(p) && p.name === node) return;
      if (ts.isCallExpression(p) && p.expression === node) return;
      if (ts.isPropertyAccessExpression(p) && p.name === node) return;
      safe = false;
    }
    ts.forEachChild(node, visit);
  }
  ts.forEachChild(sourceFile, visit);
  return safe;
}

function stripServicesParam(code: string): string {
  const sourceFile = ts.createSourceFile('action.js', code, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);

  const servicesMap = new Map<string, number>();
  for (const stmt of sourceFile.statements) {
    const info = getFunctionServicesInfo(stmt);
    if (info && isOnlyCalledDirectly(info.name, sourceFile)) {
      servicesMap.set(info.name, info.idx);
    }
  }
  if (servicesMap.size === 0) return code;

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
): Promise<{ entry: CompiledEntry | null; warnings: string[] }> {
  const relativePath = path.relative(sourceDir, filePath);
  const { bundledJs, errors: bundleErrors } = await bundleFile(filePath);
  if (bundleErrors.length > 0) {
    return { entry: null, warnings: bundleErrors.map(e => `${relativePath}: ${e}`) };
  }

  const warnings = validateBundledOutput(bundledJs, relativePath);
  const meta = extractMeta(bundledJs);
  if (!meta) {
    return { entry: null, warnings: [...warnings, `${relativePath}: could not extract meta object`] };
  }

  const body = extractFunctionBody(bundledJs, config.functionName, config.isAsync);
  if (body === null) {
    return { entry: null, warnings: [...warnings, `${relativePath}: could not extract ${config.functionName} function body`] };
  }

  const inlinedHelpers = extractInlinedHelpers(bundledJs, config.functionName);
  const rawFnBody = inlinedHelpers ? `${inlinedHelpers}\n\n${body}` : body;
  const fnBody = stripServicesParam(rawFnBody);

  const compiled: Record<string, any> = {
    label: meta.label,
    ...(meta.description && { description: meta.description }),
    ...(meta.category && { category: meta.category }),
    [config.fields.metaInput]: meta[config.fields.metaInput] || {},
    [config.fields.fnBody]: fnBody,
    ...(meta[config.fields.output] && { [config.fields.output]: meta[config.fields.output] }),
  };

  const sourceHash = crypto.createHash('sha256')
    .update(JSON.stringify(compiled))
    .digest('hex')
    .slice(0, 16);

  return { entry: { ...compiled, sourceHash } as CompiledEntry, warnings };
}

// --- Pure compilation (returns results, no file I/O for output) ---

export async function compileSourceDir(
  sourceDir: string,
  config: Omit<CompileConfig, 'sourceDir' | 'outputFile'>,
): Promise<CompileResult> {
  if (!fs.existsSync(sourceDir)) {
    return { entries: [], warnings: [] };
  }

  const { sourceFiles } = scanSourceFiles(sourceDir);
  const allWarnings: string[] = [];
  const entries: CompiledEntry[] = [];

  for (const file of sourceFiles) {
    const filePath = path.join(sourceDir, file);
    const fullConfig: CompileConfig = {
      ...config,
      sourceDir,
      outputFile: '',
    };
    const { entry, warnings } = await compileSourceFile(filePath, sourceDir, fullConfig);
    allWarnings.push(...warnings);
    if (entry) entries.push(entry);
  }

  return { entries, warnings: allWarnings };
}

// --- Legacy wrapper (reads + writes files, used by default-setup/build/compile.ts) ---

export async function compileAllSourceFiles(config: CompileConfig): Promise<void> {
  const sourceDir = path.resolve(config.sourceDir);
  const outputFile = path.resolve(config.outputFile);

  console.log(`Compiling from: ${sourceDir}`);

  const result = await compileSourceDir(sourceDir, {
    functionName: config.functionName,
    isAsync: config.isAsync,
    fields: config.fields,
  });

  for (const entry of result.entries) console.log(`  + ${entry.label}`);
  if (result.warnings.length > 0) {
    console.log('\nWarnings:');
    for (const w of result.warnings) console.warn(`  ! ${w}`);
  }

  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(result.entries, null, 2) + '\n');
  console.log(`\nWrote ${result.entries.length} entries to ${path.relative(process.cwd(), outputFile)}`);
}

export function sourceHash(data: object): string {
  return crypto.createHash('sha256')
    .update(JSON.stringify(data))
    .digest('hex')
    .slice(0, 16);
}
