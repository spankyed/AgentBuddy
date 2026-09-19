# Goal docs

A goal doc is a plan an agent can pick up later and carry out without the conversation that produced it. It holds the prompt to run it with, the facts behind the plan, the decisions already made, the work in phases with checks, and the rules for doing it. When the work is done, the doc records what happened and moves to the archive.

This file describes how to write one. The best current examples are [`goal-package-boundaries.md`](goal-package-boundaries.md) (a finished goal with its outcome) and [`goal-lmdb-only.md`](goal-lmdb-only.md) (a goal with spike results and open decisions).

## Where they live

- **`docs/goals/`**: goals not started or in progress.
- **`docs/archive/goals/`**: finished, absorbed or abandoned goals. Moving a doc there takes a note at the top (see [Finishing a goal](#finishing-a-goal)). An archived doc records the code as it was, so it will name things that have since been renamed or removed: read it as history, and don't update it to match the code.
- **File name:** `goal-<short-kebab-topic>.md`, named after what it achieves, not the ticket or the date (`goal-lmdb-only.md`, `goal-abuddy-db-cli.md`).

## When to write one

Write a goal doc when the work:
- spans several sessions or phases;
- needs decisions settled first;
- should be picked up by an agent later rather than done now.

A single fix, or a plan the user is acting on right away, stays in the conversation.

## Structure

Sections in this order. Leave out a section that has nothing in it, rather than writing "none".

### 1. The prompt block

The doc opens with a one-line note naming the session that wrote it, for context the doc left out (the id is the transcript's file name under `~/.claude/projects/<project>/`):

```
> **Written in session** `<session id>` (Claude Code, YYYY-MM-DD). Resume it with `claude -r <session id>`.
```

Then a fenced code block (```` ``` ````) holding the prompt a user pastes to start the work (for example with `/goal`). It's self-contained: the agent reads the rest of the doc because the prompt tells it to.

````
```
# Goal: <what it achieves, in one line>

Implement docs/goals/goal-<topic>.md on a branch cut from <branch or "after goal-<other>.md lands">.
Read Background, Decisions, Phases and Constraints first. Decisions are final: implement them, don't
reopen them or stop to ask. <If there are open decisions: "The Open decisions must be settled with the
user before Phase N; if any is still marked open, stop and ask.">
Where a detail isn't specified, pick the conventional option, note it in the final summary, and keep
going. No backward compatibility in code: change signatures, move modules, migrate every in-repo caller,
test, fixture, template and doc in the same change, and fix forward. Stored user data is the exception:
it moves with migrations.

Finished when:
- Phases 1–N are implemented and each meets its "Done when"; every new guard, helper or test is
  mutation-checked.
- <the end state, as checkable facts: what exists, what's gone, what behaves how>
- <the check list: typecheck, schema/api/facade checks, packages:build + packages:check, the unit suites
  the goal touches>
- <npm run build, E2E, test:external-pack, test:packaged-authoring, the example pack, as relevant>
- A final summary: phase → done/deferred, evidence, and the conventional choices made.

Commit as you go:
- Commit each phase when its "Done when" holds and the checks are green — not once at the end. A
  phase is landable on its own; a commit is how that stays true. Conventional message, no
  Co-Authored-By or session lines, `git commit -- <paths>` naming only that phase's files.
- Check `git diff --cached` first: something outside the session stages files, and a pathspec commit
  leaves the rest of the index alone.
- Don't push, tag, or open a PR unless the user asks.

Never:
- push, tag or open a PR unless the user asks in this session.
- npm publish, create GitHub releases, or trigger workflows (dry runs only).
- open, copy or modify ~/Library/Application Support/abuddy* or any real data dir.
- pkill/killall Electron or node; launch the app outside the test env without an isolated
  ABUDDY_USER_DATA_DIR.
- run bare tsc on packages/preload, `npm install` in the example pack, or edit version/release
  metadata.
- change the typed EARS types' behaviour (packages/abuddy-sdk/TYPED-EARS.md) to make a call site compile.
- add backward-compat shims or loosen a failing assertion instead of investigating.
- <goal-specific prohibitions, e.g. approaches the spikes ruled out>
```
````

Rules for the prompt block:
- **"Finished when" is the stop condition.** A `/goal` hook checks it, so every item must be checkable from the transcript: a spec passes, a command succeeds, a name no longer exists.
- **Keep the "Never" list.** It's the standing list (git, publishing, real data, processes, preload, example pack, release metadata, typed EARS, shims, assertions) plus the goal's own. Don't list an item in "Never" that a phase requires: if the goal needs something the list normally forbids, say so in the phase and leave it out of the list. A goal once required a step its own "Never" forbade, and the run could not finish.
- **Name steps that need the user.** If a check depends on something only the user can do (installing dependencies in another repo, approving a data copy), say so in the prompt, so the agent asks instead of looping.

### 2. Background

What exists now, and why the goal is needed, as facts the agent can check:
- file paths with line numbers where they matter (`packages/abuddy-ears/src/query.ts:57`);
- how the current code works, and what depends on the part being changed;
- the date and commit the survey was made at, when the code moves quickly (`## Background (2026-09-14, at 114d18e1b)`).

Keep it factual. No recommendations here; those go in Decisions.

### 3. Spike results (when a spike ran)

`## Spike results (YYYY-MM-DD)`. Record what was tried and measured:
- **Where the spike code is.** Worktree or branch, the commit it started from, and that it's throwaway. Assume it will be deleted: copy into the doc everything a later agent needs (key layouts, seams, measured numbers, gotchas).
- **Whether to reuse its code.** Usually "don't reuse; rewrite on the branch, keeping X".
- **Results as tables:** what passed, what failed and why, benchmark numbers with the method (runs, median, machine).
- **What it didn't cover**, so a phase proves it.

### 4. Decisions

The settled design, numbered so phases and later notes can cite them ("Decision 3"). Each decision says what to do and, briefly, why. Say "Final." at the top when the user has agreed to them.

- Decisions can't be reopened by the implementing agent. If one turns out wrong in practice, the agent notes it under the Outcome's "Corrections to the Decisions" and follows the corrected approach.
- Name the things being deleted or renamed explicitly, so a guard test and the docs can check them.

### 5. Open decisions (only while any are open)

`## Open decisions (settle with the user before Phase N)`. Number them, give the options with their trade-offs neutrally, and mark each `— *open*`. When the user decides, move the choice into Decisions and delete the entry. The prompt block tells the agent to stop and ask if any is still open when it reaches that phase.

### 6. Phases

`### Phase N — <name>`, each with:
- **The work.** Bullets naming the files, modules and behaviour, citing Decisions instead of repeating them.
- **"Done when:"** Checkable conditions: named specs pass, commands succeed, guards exist, measured numbers are within a stated tolerance. Include the mutation checks for new guards: "Mutation: skipping X fails Y".

Order phases so each leaves the code working and the full check list passing. A phase that can't finish without another says so ("after Phase 3"). If a phase can land before an earlier one, say that too.

**Commit a phase when it's done, before starting the next one.** "Landable on its own" is a property the code has while the phase is finishing and loses once the next one starts: a later phase that edits the same files makes the earlier one impossible to separate afterwards. `git commit -- <paths>` takes a file's whole working state, so once two phases have touched one file there is no honest split left — you either ship both together or ship a commit that doesn't build. The pack-naming goal ran all five phases before committing and could only be landed as three commits instead of five, nine files having picked up several phases each (`docs/archive/goals/goal-pack-naming.md`). Committing as you go costs nothing and is the only moment the split is free.

### 7. Deferred (optional)

Work deliberately left out of the goal, with a pointer to where it's tracked if anywhere. The agent must not do it.

### 8. Constraints

The standing rules, as prose bullets (the prompt's "Never" list in fuller form), plus the goal's own:
- commit each phase as it finishes, in logical chunks, no attribution lines, `git diff --cached` first;
  pushing, tagging and PRs are on request;
- no publishing, releases or triggered workflows;
- no real data dirs, no broad pkill, E2E in the `abuddy-test` namespace;
- preload, example pack and release metadata rules;
- typed EARS types are change-controlled (`packages/abuddy-sdk/TYPED-EARS.md`);
- published packages: no `any`, the TypeScript floor, `api:update` after export changes;
- build order (`packages:build` before the CLI suite, default-setup's runtime before the api suites and E2E);
- migrations follow `packages/abuddy-host/src/migrations/CLAUDE.md`;
- investigate failing tests, mutation-check new guards;
- external packs are first-class: keep the fixture packs, the example pack and `test:packaged-authoring` passing.

## Finishing a goal

When the work is done, move the doc to `docs/archive/goals/` and add a status blockquote as its first line, above the session note. Move it when the work is done, not when it merges: a goal whose phases are all finished is history, and leaving it in `docs/goals/` reads as a plan and keeps describing code that no longer exists. Name wherever the work is — a PR, a branch, a commit — or nothing at all if there's nothing useful to name.

- **Done:** `> **Done** (<where the work is, if it's worth naming>). The text below is the plan as written; <what later work changed>. For the current layout, see <doc>.`
- **Absorbed by another goal:** `> **Absorbed by [`goal-x.md`](../../goals/goal-x.md)** (its Decision N and Phase M). <which decisions it superseded>. The text below is the plan as written…`
- **Superseded in part:** `> **Superseded in part** by `goal-x.md`: <what changed>.`

Fix links in other docs to the moved file. Docs outside the archive must describe the code as it is; the archived doc keeps the old names.

### The Outcome section

An archived doc carries an Outcome section, before Deferred and Constraints. **Write it at archive time if it isn't there already, and never hold up the move for it.** Nobody writes one as they go, so requiring it first is how finished goals sit in `docs/goals/` describing code that has changed — which costs more than a thin Outcome does.

Take the parts that have something in them:

```
## Outcome (YYYY-MM-DD)

<one paragraph: where it landed, and anything that didn't pass>

### Per phase
| Phase | Status | Evidence |          (done / deferred; specs, commands, guards)

### Conventional choices               (details the doc didn't specify, per phase)
### Corrections to the Decisions       (where the implementation had to differ, and why)
### Open items                         (known leftovers and follow-ups)
### Final verification                 (the full check list, with results)
```

A goal that went as planned needs the paragraph and the per-phase lines, not five headings — leave out a section with nothing in it, as everywhere else in this format. The two worth stretching for are **Corrections to the Decisions**, because a decision the implementation had to break is the thing a later reader most needs and the only place it gets recorded, and **Open items**, which is where the follow-ups go instead of a conversation nobody can find.

Writing it later means writing it from the branch rather than from memory: the commits, the specs that landed and the doc's own Phases are enough to reconstruct one, and an Outcome written that way is no worse than one written as you went.

Benchmarks and measurements go where the doc asked for them: inside the phase, or in a table in the Outcome.

## Writing style

- **Plain, specific sentences.** Name the file, function, command or spec. Avoid vague words ("robust", "cleanly", "properly").
- **Facts in Background and Spike results, choices in Decisions.** Recommendations belong in Decisions, or as neutral options under Open decisions.
- **Explain terms the reader may not know** the first time they appear (what a partition is, what a hook does), briefly.
- **Checkable over aspirational.** "`tests/boundaries.spec.ts` fails if `src/services` gains a file" beats "services stay tidy".
- **Record dates and commits** for surveys and spikes, and method and machine for measurements.
- **Keep it current while it's open.** When a decision changes or a spike reruns, update the doc instead of appending contradictions.
