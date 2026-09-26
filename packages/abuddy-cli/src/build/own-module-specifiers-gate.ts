// A pack names its own modules by the file that is there, extension and all: `#generated/events.ts`, not
// `#generated/events`, and `./contract.ts`, not `./contract`. No runtime resolves an extensionless specifier
// in ESM, so one works only while a build guesses the suffix, and this build stopped guessing
// (`docs/archive/goals/goal-pack-imports-name-the-file.md`).
//
// The repo's own packs are checked by scripts/check-import-specifiers.ts; this is the same rule for every
// other pack, at build time, beside `internal-imports-gate.ts`, which is shaped the same way and reads the
// pack's sources with the same reader. The rule itself is `@abuddy/host/build/own-module-specifiers`, which
// both callers share.
import { ownModuleProblems } from '@abuddy/host/build/own-module-specifiers';
import { packSpecifiers } from './pack-sources.ts';

/** `file:line: specifier -> what it should say` for each of the pack's own-module specifiers naming no file */
export function ownModuleSpecifierProblems(packDir: string, dirs: readonly string[] = ['src']): string[] {
  return ownModuleProblems(packDir, packSpecifiers(packDir, dirs));
}
