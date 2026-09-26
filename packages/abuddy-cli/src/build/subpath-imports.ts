/**
 * Reading a pack's `package.json` `imports`, and resolving a module path the way a pack author writes one.
 *
 * **esbuild resolves the mapping itself and still needs this.** Measured with esbuild 0.25.12: given
 * `"imports": { "#gen/*": "./src/gen/*" }` it finds the target and names the file in its error —
 * `Could not resolve "#gen/events" … Import from ".ts" to get the file …/src/gen/events.ts` — but refuses
 * an extensionless specifier and a directory, as Node's ESM resolver does. Pack code is TypeScript and
 * writes `from '#generated/events'`, so the whole job here is supplying the suffix esbuild will not guess.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * The extensions a pack's module may have, source first.
 *
 * One list for both the file and the directory-index attempt, because two lists drifted: the file attempt
 * had `.mts` and `.mjs` and neither of their CJS counterparts, and the index attempt had `index.ts` alone.
 */
const MODULE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs'];

/** `statSync` rather than `existsSync`: the latter is true for a directory, which is the bug below */
const isFile = (target: string): boolean => {
  try {
    return fs.statSync(target).isFile();
  } catch {
    return false;
  }
};

/**
 * `<dir>/events` → `<dir>/events.ts`, and `<dir>/repository` → `<dir>/repository/index.ts`.
 *
 * The directory case used to be unreachable. The loop began with the empty extension and used
 * `fs.existsSync`, which is true of a directory, so a bare directory returned *itself* and the `index.ts`
 * fallback written underneath it never ran — dead code for exactly the case it was written for. esbuild
 * then got a directory where it wanted a file. Latent: no pack in this repo imports a directory through a
 * subpath today, so nothing had failed on it yet.
 */
export function resolveWithExtensions(base: string): string | undefined {
  if (isFile(base)) return base;
  for (const ext of MODULE_EXTENSIONS) if (isFile(base + ext)) return base + ext;
  for (const ext of MODULE_EXTENSIONS) {
    const index = path.join(base, `index${ext}`);
    if (isFile(index)) return index;
  }
  return undefined;
}

/**
 * The conditions that apply when bundling a pack's backend, and nothing else.
 *
 * A condition map is ordered by the author's preference and Node takes the first that applies, so this
 * keeps that order rather than imposing one. The previous reader tried `default`, then `require`, then
 * `node`, and never `import` — and `abuddy init` writes `"type": "module"`, so `import` is the condition a
 * pack's own entries are most likely to carry. `types` is TypeScript's and never a runtime target.
 */
const APPLICABLE_CONDITIONS = new Set(['node', 'import', 'require', 'default']);

/** A pack's `package.json` `imports`, flattened to one target per pattern. */
export function readSubpathImports(packDir: string): Record<string, string> {
  const imports: Record<string, string> = {};
  const pkgPath = path.join(packDir, 'package.json');
  if (!fs.existsSync(pkgPath)) return imports;
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { imports?: Record<string, unknown> };
    for (const [pattern, target] of Object.entries(pkg.imports ?? {})) {
      if (typeof target === 'string') {
        imports[pattern] = target;
        continue;
      }
      if (typeof target !== 'object' || target === null) continue;
      for (const [condition, value] of Object.entries(target as Record<string, unknown>)) {
        if (typeof value === 'string' && APPLICABLE_CONDITIONS.has(condition)) {
          imports[pattern] = value;
          break;
        }
      }
    }
  } catch (err) {
    // Silence here meant a pack whose manifest cannot be parsed bundled with no subpath imports at all, and
    // then failed as "can't resolve #generated/…" — a manifest that does not parse is the thing to say.
    console.warn(`! couldn't read ${pkgPath}, so its subpath imports are ignored: ${(err as Error).message}`);
    return {};
  }
  return imports;
}
