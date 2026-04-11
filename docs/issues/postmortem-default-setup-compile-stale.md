# Post-Mortem: Stale `default-setup/dist/compiled-actions.json` during dev loop

**Date:** 2026-04-11
**Severity:** Low (developer friction) — did not affect users, but cost significant debugging time and blocked shipping a fix
**Affected:** Every developer editing files in `packages/default-setup/src/actions/**` between the introduction of the sandboxed action compiler and today

## Incident

Across a single development session, the same footgun bit us **three separate times** while shipping fixes to the Claude Code chat action (`packages/default-setup/src/actions/claude-code/chat.ts`) and its helpers:

1. Each fix was written in source.
2. Unit tests (both `@app/api` and `@app/default-setup`) passed.
3. `tsc --noEmit` was clean.
4. `git diff` confirmed the source file had the intended change.
5. The user rebuilt the backend via `npm run start:gen` and relaunched Electron.
6. **The running app still exhibited the old behaviour.**

The most painful instance was the `updatedInput` permission-response fix. After landing the fix, the user still saw every approved tool fail with:

```
Tool permission request failed: ZodError: [ { "code": "invalid_union", "errors": [ [ { ...
```

We burned a full debugging cycle hypothesizing the bug was elsewhere — the approval shape parser, the approval block render path, the threads system routing — before I thought to `grep updatedInput packages/default-setup/dist/compiled-actions.json` and discovered the compiled bundle had **zero occurrences** of the field the source file defined. The running app was executing bytecode from a revision committed hours earlier.

## Root cause

**`@app/default-setup` uses a custom compile step that isn't wired into `build:be`.**

The `default-setup` workspace is unusual. Its source files (`src/actions/**/*.ts`, `src/prompts/**/*.ts`, `src/flows/**/*.ts`, `src/library/**/*.md`, and notes) are not consumed as normal Node/TypeScript modules at runtime. Instead, they are compiled via a custom `build/compile.ts` script (esbuild + AST extraction) into a JSON bundle at `packages/default-setup/dist/compiled-actions.json` (and sibling files for the other DSL targets). The api server, at startup, imports these JSON files and seeds its action registry from them, then executes action function bodies inside a sandboxed scope. This is the design described in `packages/default-setup/CLAUDE.md`.

The five compile scripts are already exposed at the repo root:

```json
"compile":          "npm run compile:actions && npm run compile:prompts && ...",
"compile:actions":  "npm run compile:actions --workspace @app/default-setup",
"compile:prompts":  "npm run compile:prompts --workspace @app/default-setup",
"compile:flows":    "npm run compile:flows --workspace @app/default-setup",
"compile:library":  "npm run compile:library --workspace @app/default-setup",
"compile:notes":    "npm run compile:notes --workspace @app/default-setup",
```

But the three dev launch scripts — `start`, `start:gen`, `start:inspect` — all transitively invoke `build:be`, which was defined as:

```json
"build:be": "npm run build --workspace @app/api"
```

That only rebuilds `@app/api`. It does **not** run `compile`. So every dev launch loaded whatever was already on disk at `default-setup/dist/compiled-actions.json` from the last time someone manually ran `npm run compile:actions`. Source edits silently didn't land.

### Why testing didn't catch it

- **Unit tests import source directly.** `packages/default-setup/tests/unit/**/*.spec.ts` (and the cross-workspace tests in `packages/api/tests/unit/`) all import the `.ts` helpers via relative paths. They never read `dist/compiled-actions.json`. A source-level fix that doesn't get compiled still passes every unit test.
- **`tsc --noEmit` reads source.** TypeScript walks the source graph. The compiled bundle is JSON and outside tsc's view entirely.
- **`actions-export.spec.ts` does read the compiled bundle** — but it only asserts that the bundle exists and has the right number of entries, not that any specific action contains any specific string. So a stale bundle passes that test too.

### Why it's hard to notice

- **`git status` and `git diff` show source, not compiled output.** `dist/compiled-actions.json` is in `.gitignore`, so there's no "stale artifact" signal in the working tree.
- **The "gen" in `start:gen` means something else.** `start:gen` regenerates api's TypeScript `.d.ts` defs (via `postbuild` → `generate:defs-types`). It does NOT regenerate the DSL JSON bundles. The naming is misleading — a developer reading `start:gen` reasonably assumes "full regeneration", but it only covers defs.
- **The first symptom is "my fix didn't work"**, which primes you to debug the fix itself — not the build step that silently dropped it.
- **Three independent occurrences in one session reinforced the pattern**: each time the diagnosis was different (plan-mode system prompts, missing tool exposure, Zod union shape), so it wasn't obvious until the third instance that all three were masked by the same stale-compile problem.

## Fix

One-line addition to the repo-root `package.json`:

```json
"prebuild:be": "npm run compile"
```

npm automatically invokes `prebuild:be` before any `build:be` run, regardless of whether `build:be` was invoked directly or transitively. Because `start`, `start:gen`, and `start:inspect` all pass through `build:be`, every dev launch path now runs the full DSL compilation step before the api server starts. Source edits land in `dist/compiled-actions.json` automatically; the running app always matches the source tree.

The `npm run compile` script was already defined at the repo root and already delegates to `@app/default-setup`'s `compile:actions`, `compile:prompts`, `compile:flows`, `compile:library`, and `compile:notes` in series. No new scripts, no new dependencies, no cross-workspace changes. The machinery was there — it just wasn't hooked into the dev loop.

**Commit:** `chore(build): auto-compile default-setup before build:be to stop source edits going stale`

### Verification

```bash
# Touch a default-setup source file
touch packages/default-setup/src/actions/claude-code/chat.ts

# Run the affected path
npm run build:be

# Expect npm to print the prebuild step before build:be:
#   > prebuild:be
#   > npm run compile
#   ...compile:actions → compile:prompts → compile:flows → compile:library → compile:notes
#   > build:be
#   > npm run build --workspace @app/api

# Confirm the compiled bundle's mtime advanced
stat -f '%m' packages/default-setup/dist/compiled-actions.json
```

Tested by running `npm run build:be` directly after the change — the `prebuild:be` hook fires, all 5 compile steps run, and the compiled bundle is regenerated before the api rebuild.

## Why alternatives were rejected

- **Inline `npm run compile && npm run build --workspace @app/api`** in `build:be`: same effect but harder to read. The `pre*` hook is the idiomatic npm pattern for "run this first".
- **`prestart` / `prestart:gen` / `prestart:inspect`**: three places to maintain, and the `pre*` hook only fires for the explicit script you invoke — so `prestart:gen` wouldn't fire if a developer ran `npm start` directly. `prebuild:be` is a single choke point that every launch path already passes through.
- **Compiling only `compile:actions`** (the step that was actually stale in this incident): faster, but misses edits to prompts/flows/library/notes. Those files are compiled the same way and are equally susceptible to staleness. Full `compile` takes ~10 seconds total, which is noise compared to the api TypeScript rebuild that already runs on every `build:be`.
- **Adding a `build` script to `@app/default-setup`**: would make `npm run build -ws --if-present` at the repo root pick it up, but `build:be` targets only `@app/api` so dev launches wouldn't benefit. Would still require the `prebuild:be` hook anyway.

## Why this wasn't caught earlier

The project's `default-setup` workspace post-dates most of the other packages and brought a novel runtime model (sandboxed action execution from a pre-compiled JSON bundle) to a codebase that otherwise uses standard Node/TypeScript import resolution. When the workspace was introduced, `compile:actions` / `compile:prompts` / etc. scripts were added to the root `package.json` for manual invocation, but the "dev loop should always compile" wiring was never put in. Developers who remembered to run `npm run compile` manually didn't hit the footgun; developers who assumed `start:gen` regenerated everything did.

This session was the first time the footgun bit during a multi-fix debugging session where the same person was rapidly iterating on `chat.ts`, so the pattern became obvious.

## Takeaways

1. **Custom build steps need dev-loop integration at the time they're introduced**, not retroactively. When the `default-setup` compile was added, a `prebuild:be` hook (or equivalent) should have landed in the same commit.
2. **Name dev scripts after what they actually do.** `start:gen` regenerates defs, but its name implies "start with full regeneration". A future rename (e.g., `start:with-defs`) would have helped someone reading the scripts understand what's in and out.
3. **Stale compiled artifacts are invisible to `git status` because they're gitignored.** For build outputs that are load-bearing at runtime, add a CI check that re-runs the compile and diffs the result — if the compile is non-deterministic or out of date, CI fails. Out of scope for this post-mortem but worth considering if the bundle format grows.
4. **When debugging "my fix isn't landing in the running app", the first check should be the compiled artifact, not the source file.** `grep <expected string> packages/default-setup/dist/compiled-actions.json` is a 2-second sanity check that would have saved an hour on the last occurrence. This heuristic should make it into a troubleshooting doc for the Claude Code subsystem.
5. **The three occurrences this session were spread across three different surface-level bugs** (plan-mode tool visibility, tool_result error display, approval shape Zod validation). Without the compile-staleness diagnosis they'd have looked like three unrelated regressions. One shared root cause — automate the compile and the whole class of "my fix didn't work" disappears.

## Related

- Commit that introduced the `prebuild:be` hook: (this session, see git log)
- `packages/default-setup/CLAUDE.md` — describes the compile → runtime execution model for the sandboxed action system
- `packages/default-setup/build/compile.ts` — the esbuild + AST extraction entry point the compile scripts delegate to
- `packages/api/tests/unit/actions-export.spec.ts` — the one place that reads `compiled-actions.json` from a test, and only for existence/shape assertions
