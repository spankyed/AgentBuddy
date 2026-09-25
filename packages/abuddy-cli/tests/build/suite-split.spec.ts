import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as ts from 'typescript';

/**
 * The fast suite spawns nothing. `npm test -w @abuddy/cli` is the per-change loop and is only worth running
 * if it stays seconds; the specs that run a real build, an install or another process are
 * `*.integration.spec.ts` and run from `vitest.integration.config.ts`. Without this check the fast suite
 * silently becomes slow again, one spec at a time, which is the failure this repo keeps rediscovering.
 *
 * It resolves spawning through the test helpers rather than looking only at each spec: `published-packages`
 * exports both `REPO_ROOT`, which is a string, and `installPublishedPackages`, which runs `npm pack`. Which
 * exports reach a spawn is computed from the helper's own source, so adding one needs no edit here.
 */
const TESTS = path.join(__dirname, '..');
const SPAWNERS = ['execFileSync', 'execSync', 'spawnSync', 'spawn', 'execFile', 'exec', 'fork'];

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
}

/** Every `import` in a file, as `{ from, names }` — `names` empty for a namespace or side-effect import */
function importsOf(src: ts.SourceFile): { from: string; names: string[] }[] {
  const out: { from: string; names: string[] }[] = [];
  for (const s of src.statements) {
    if (!ts.isImportDeclaration(s) || !ts.isStringLiteral(s.moduleSpecifier)) continue;
    const bindings = s.importClause?.namedBindings;
    const names = bindings && ts.isNamedImports(bindings) ? bindings.elements.map((e) => e.name.text) : [];
    out.push({ from: s.moduleSpecifier.text, names });
  }
  return out;
}

/**
 * The exported names in `file` whose implementation reaches a child process, by fixed point over the
 * module's own declarations: a declaration spawns if its text names a `node:child_process` binding or
 * another declaration that spawns.
 */
const spawningExportsCache = new Map<string, Set<string>>();
function spawningExports(file: string): Set<string> {
  const cached = spawningExportsCache.get(file);
  if (cached) return cached;
  const result = new Set<string>();
  spawningExportsCache.set(file, result); // set first: a cycle resolves to what is known so far
  if (!fs.existsSync(file)) return result;
  const src = parse(file);

  const direct = new Set<string>();
  for (const { from, names } of importsOf(src)) {
    if (from === 'node:child_process' || from === 'child_process') names.forEach((n) => direct.add(n));
    else {
      const resolved = resolve(file, from);
      if (resolved) for (const n of names) if (spawningExports(resolved).has(n)) direct.add(n);
    }
  }

  // name -> its source text, for every top-level declaration
  const decls = new Map<string, { text: string; exported: boolean }>();
  for (const s of src.statements) {
    const mods = ts.canHaveModifiers(s) ? ts.getModifiers(s) : undefined;
    const exported = !!mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (ts.isFunctionDeclaration(s) && s.name) decls.set(s.name.text, { text: s.getText(), exported });
    else if (ts.isVariableStatement(s)) {
      for (const d of s.declarationList.declarations) if (ts.isIdentifier(d.name)) decls.set(d.name.text, { text: d.getText(), exported });
    }
  }

  const spawns = new Set<string>();
  for (let changed = true; changed; ) {
    changed = false;
    for (const [name, { text }] of decls) {
      if (spawns.has(name)) continue;
      const reaches = [...direct, ...spawns].some((s) => new RegExp(`\\b${s}\\s*\\(`).test(text));
      if (reaches) { spawns.add(name); changed = true; }
    }
  }
  for (const name of spawns) if (decls.get(name)?.exported) result.add(name);
  return result;
}

/** A relative specifier as a path on disk, or undefined for a package */
function resolve(from: string, spec: string): string | undefined {
  if (!spec.startsWith('.')) return undefined;
  const base = path.resolve(path.dirname(from), spec);
  for (const c of [base, `${base}.ts`, path.join(base, 'index.ts')]) if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  return undefined;
}

function specs(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return specs(full);
    // Mirrors vitest.config.ts's include/exclude: every spec the fast suite runs
    return e.name.endsWith('.spec.ts') && !e.name.endsWith('.integration.spec.ts') ? [full] : [];
  });
}

/** Why `file` reaches a child process, or null */
function reasonItSpawns(file: string): string | null {
  const src = parse(file);
  for (const { from, names } of importsOf(src)) {
    if (from === 'node:child_process' || from === 'child_process') return `imports ${names.join(', ') || '*'} from ${from}`;
    const resolved = resolve(file, from);
    if (!resolved) continue;
    const spawning = spawningExports(resolved);
    const used = names.filter((n) => spawning.has(n));
    if (used.length) return `imports ${used.join(', ')} from ${path.relative(TESTS, resolved)}, which spawns`;
  }
  return null;
}

describe('the fast suite spawns nothing', () => {
  it('has no spec that reaches a child process', () => {
    const offenders = specs(TESTS)
      .map((f) => ({ spec: path.relative(TESTS, f), why: reasonItSpawns(f) }))
      .filter((r) => r.why)
      .map((r) => `${r.spec}: ${r.why} — rename it to *.integration.spec.ts`);
    expect(offenders).toEqual([]);
  });

  it('finds the spawning exports of a helper without being told them', () => {
    // The check is only as good as this: `REPO_ROOT` is a string and must not count, `installPublishedPackages`
    // runs `npm pack` and must. If this drifts, the check above starts passing for the wrong reason.
    const helper = path.join(TESTS, 'helpers', 'published-packages.ts');
    const spawning = spawningExports(helper);
    expect(spawning.has('installPublishedPackages')).toBe(true);
    expect(spawning.has('REPO_ROOT')).toBe(false);
    expect(spawning.has('PACKAGES_BUILT')).toBe(false);
  });
});
