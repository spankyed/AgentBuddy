/**
 * A vitest reporter that reports nothing and records one number: how many spec files the run executed.
 *
 * `scripts/spec.ts` needs that count because a run's exit status cannot give it — `vitest related` exits 0 for a
 * file the module graph reaches no spec from, so "nothing covers this" and "everything covering this passed"
 * were the same answer until this existed.
 *
 * Why a reporter of our own rather than vitest's `json` one: that reporter prints `JSON report written to
 * <path>` through its logger whenever `outputFile` is set, unconditionally and with no option to silence it
 * (`vitest/dist/chunks/index.*.js`), so every source-file run would end with a line about a temp file. The
 * alternative — piping the child's stdout to filter that line — costs the TTY, because vitest renders
 * differently when its output is not a terminal.
 *
 * The path comes from the environment rather than a reporter option so that nothing has to be threaded through
 * vitest's config resolution; `spec.ts` sets it per run.
 */
import * as fs from 'node:fs';
import type { Reporter } from 'vitest/reporters';

/** The environment variable `scripts/spec.ts` puts the destination in */
export const SPEC_COUNT_FILE = 'SPEC_COUNT_FILE';

/**
 * The hook, named once and checked against vitest's own interface.
 *
 * This is what makes a vitest upgrade a compile error rather than a silent regression: if the hook is renamed or
 * removed, `typecheck` fails here. Without it, the reporter would simply stop being called — no file written,
 * `spec.ts` unable to tell a covered run from an empty one, and every claiming run reading as a pass again,
 * which is the defect exit 3 exists to prevent. Not a hypothetical: `onFinished`, the hook this used first, is
 * already `@deprecated use onTestRunEnd instead` in vitest 3.2.4.
 */
const HOOK = 'onTestRunEnd' satisfies keyof Reporter;

export default class SpecCountReporter implements Reporter {
  [HOOK](modules: readonly unknown[] = []): void {
    const out = process.env[SPEC_COUNT_FILE];
    if (out !== undefined) fs.writeFileSync(out, String(modules.length), 'utf-8');
  }
}
