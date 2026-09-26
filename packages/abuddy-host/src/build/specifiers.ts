/**
 * What a module specifier names, for the tooling that reads one.
 *
 * Here rather than in the repo's `scripts/` because both sides need it: the build scripts that pack the
 * published packages, and packages' own code and specs. A module in `scripts/` belongs to no package, so a
 * package reaching it has to do so by relative path out of its own tree — which `check:specifiers` now
 * refuses, and which made a spec unreachable from the file it covers (`npm run spec` routes `scripts/` to
 * one package, so the others never ran).
 *
 * The rule below had three copies before this: here, `abuddy-cli/src/build/facade-gate.ts` and
 * `scripts/lib/published-imports.ts`. It is small enough to retype and exact enough that a wrong copy is a
 * silent bug — `@scope/name` is two segments and everything else is one.
 */

/** The package a bare specifier names: `@scope/name` or `name`. */
export const packageName = (specifier: string): string =>
  specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]!;
