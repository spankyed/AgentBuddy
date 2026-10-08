// What `npm run typecheck` runs besides its legs: the prerequisite that regenerates the pack's barrel, and
// the recorded artifacts whose checks are chain steps.
//
// **Not in `typecheck-legs.ts`, though that is where a reader would look first.** That file is one of
// `STEP_TABLES`, which locates a step's declaration by its `name:` and the `seconds:` that follows it.
// An entry carrying a name and no cost of its own silently lands on a neighbour's span — `planSecondsEdits`
// caught exactly that and refused, which is the only reason it was not a wrong number written into the table.
// So anything naming a step without declaring its cost belongs outside those files.
import { ENSURE } from './typecheck-legs.ts';

/**
 * Codegen, ordered ahead of everything that reads it — the second prerequisite, and the same shape as
 * `packages:ensure`.
 *
 * It writes `packages/default-setup/src/__generated__`, which `typecheck:pack` compiles and the two
 * repo-scope legs walk, so it cannot be one of the concurrent jobs. Ordered, it buys two things: the pack's
 * typecheck stops compiling whatever generated code happened to be on disk, and `facade:check` below can run
 * as a pure reader. Costs a hash comparison in milliseconds when nothing moved, and a measured 1.6s when it
 * did (median of 3, 2026-10-08).
 */
export const CODEGEN = 'generate:entries';

/**
 * The recorded artifacts' checks, which are chain steps rather than legs and stay that way.
 *
 * **They are borrowed, not moved.** `api:check` as a leg would need five hand-written fields on a table whose
 * point is deriving them, and would drop nine declared inputs — six with nothing to catch it, since the
 * modules deciding what a report says are spawned through npm rather than imported. Borrowing takes each
 * step's own class, cost and width and leaves its cache key alone.
 *
 * Why they are here at all: `exports:check` and `schema:check` are legs, so a green `npm run typecheck` used
 * to say nothing about the other two recorded artifacts — the trap root `CLAUDE.md` warned about in prose.
 */
export const ARTIFACT_CHECKS: readonly { readonly name: string; readonly command: string }[] = [
  { name: 'api:check', command: 'npm run api:check' },
  // `--skip-generate`, because `CODEGEN` above has just done it. Without the flag this writes into the pack
  // while the legs read it, which is the one reason it is not a leg itself
  { name: 'facade:check', command: 'npm run facade:check -w @app/default-setup -- --skip-generate' },
];

/** Both prerequisites, in the order they must run: each writes what every job after it reads */
export const PREREQUISITES = [ENSURE, CODEGEN] as const;
