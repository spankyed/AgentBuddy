/**
 * Reading a pack's `package.json` `imports`: the patterns by which a pack names its own modules.
 *
 * Nothing resolves them here any more. A pack's specifier names the file that is there
 * (`docs/archive/goals/goal-pack-imports-name-the-file.md`), and esbuild and Vite both resolve a pack's
 * mapping themselves once the path names a file — measured by deleting the two plugins that used to supply
 * the suffix and rebuilding: `abuddy build` over the fixture pack and default-setup, and the API's tsup
 * build, byte for byte the same output. What is left is the reading, which the check that a specifier names
 * its file still needs (`own-module-specifiers.ts`).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

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
