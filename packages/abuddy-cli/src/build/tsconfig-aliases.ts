/**
 * A pack's `compilerOptions.paths`, as absolute directories the bundlers can alias.
 *
 * One module because there were two copies and they disagreed. The FE bundler kept a private one that read
 * the file with `JSON.parse` after stripping `//` to end of line with a regex, and the BE bundler's was fixed
 * twice — `9d040629a` for a tsconfig whose `$schema` URL contains `//`, `2a6051230` for `extends` — with
 * neither fix reaching the copy. So the same defect was found twice, and twice the duplicate was missed:
 * a pack's FE bundle silently lost every alias where its BE bundle kept them.
 *
 * **TypeScript's own reader, not a regex.** `tsc` decides what a tsconfig means, and four things it handles
 * that hand-parsing did not: a `/* *\/` block comment, a `//` inside any string value, an `extends` chain,
 * and `baseUrl` — which is the worst of them, because ignoring it produces *wrong* aliases rather than none.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';
import { errorMessage } from '@abuddy/sdk/utils/pure';

/**
 * `{ "#generated/*": ["./src/__generated__/*"] }` → `{ "#generated": "<abs>/src/__generated__" }`.
 *
 * Only wildcard patterns with a single wildcard target, which is what an alias can express; anything else a
 * pack declares is TypeScript's business and not the bundler's. Empty when the pack has no tsconfig — a pack
 * without one is fine — and empty *with a warning* when it has one that cannot be read, because then every
 * import using an alias fails later as "can't resolve", pointing nowhere near the cause.
 */
export function readTsconfigAliases(packDir: string): Record<string, string> {
  const aliases: Record<string, string> = {};
  const tsconfigPath = path.join(packDir, 'tsconfig.json');
  if (!fs.existsSync(tsconfigPath)) return aliases;
  try {
    const { config, error } = ts.readConfigFile(tsconfigPath, (file) => fs.readFileSync(file, 'utf-8'));
    if (error) {
      warn(tsconfigPath, ts.flattenDiagnosticMessageText(error.messageText, ' '));
      return aliases;
    }
    // TypeScript's own merge, so a pack whose tsconfig extends a shared base gets the base's paths: reading
    // one file answers for one file, and `extends` is a chain only the compiler knows how to walk.
    const parsed = ts.parseJsonConfigFileContent(config, ts.sys, packDir);
    // Where a relative target is relative: `baseUrl` when the config sets one, the pack otherwise
    const from = parsed.options.baseUrl ?? packDir;
    for (const [pattern, targets] of Object.entries(parsed.options.paths ?? {})) {
      if (!pattern.endsWith('/*') || !targets[0]?.endsWith('/*')) continue;
      aliases[pattern.slice(0, -2)] = path.resolve(from, targets[0].slice(0, -2));
    }
  } catch (err) {
    warn(tsconfigPath, errorMessage(err));
    return {};
  }
  return aliases;
}

const warn = (tsconfigPath: string, why: string): void => {
  console.warn(`! couldn't read ${tsconfigPath}, so its compilerOptions.paths aliases are ignored: ${why}`);
};
