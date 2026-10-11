# The manifest names the exceptions, and the build writes the inventory

Compiled 2026-10-10 on `AS/declarative-extensions`, after the keyed-map work landed
(`27664c122`, `a6aad1e4a`). Every figure below was measured against the tree on that date.
[`manifest-convention-first.example.json`](manifest-convention-first.example.json) is
default-setup's manifest in this shape — generated from the real one, not written by hand.

## Context

`apack.json` is 711 lines and 19 root keys for the built-in pack. It is also a barrel written in JSON:
**190 path strings**, 95 bare and 95 with `#export`, and almost every one of them restates a convention
the tree already follows.

| | follow the convention exactly |
|---|---|
| feature paths (`system`, `plugin`, both contracts, `settings`, `references`, `typesEntry`) | **59 of 59** |
| feature services and repositories | **30 of 31** — and the 31st differs only in being a folder |
| step facets (`build`/`fe`/`trigger`) | **26 of 26** are `<type-dir>/<facet>.ts` |

Every service is `be/services/<name>.ts#<name>Service`. Every repository is a named export of
`be/repository/index.ts`. Every step facet is `<dir>/<facet>.ts#<camelType>{Step,Trigger}{Build,FE}`. So
`src/features/threads/be/services/chat.ts#chatService` carries one bit — `chat` — in 52 characters, and
repeats the feature id it is already nested under.

**Two conventions are so complete that the filesystem already answers what a manifest key asks.**
`listener` and `subflow` are exactly the two steps with no `runtime.ts`, and they are exactly the two with
no runtime handler. `action` and `switch` are exactly the two with a `helpers.ts`, and they are exactly
the two declaring `dsl: { custom: true }`.

**And the manifest does not describe the pack.** 90 actions, 6 prompts and 5 flows are a directory
pointer; each plugin's accepted events are 11 literal arrays inside `dist/runtime/index.cjs`. Answering
"what does this pack contribute" needs the manifest *plus* the compiled content *plus* the backend bundle,
and no artifact holds all three.

**The symptom that proves it is structural.** `apack info` — the one command whose job is to say what a
pack has — hardcoded `src/content/actions` instead of reading `content.sources.actions.path`, because the
manifest does not carry what it needed. It also printed `Features: 0` for a pack with eleven, since
`Record<string, T>`'s index signature makes `.length` type-check as `T`. Both fixed in `673790d5e`; the
second is the class of bug `goal-manifest-redesign`'s Background predicts of every reader that goes
through a type which is not `PackManifest`.

## The rule

> **A path appears only where the thing is not where the convention puts it. The key is the identity. The
> value is the one fact the build cannot derive. Everything complete lives in a resolved manifest the
> build writes and nobody edits.**

Two readers want opposite things, which is why there are two artifacts rather than one compromise:

| reader | wants |
|---|---|
| the author writing the pack | the least declaration that can work — conventions, exceptions only |
| a reviewer, another pack, the host | the complete inventory, every item named |

This is `package.json` against npm's packument, `Cargo.toml` against the rewritten one in a `.crate`,
`pyproject.toml` against a wheel's `METADATA`: the authored file is minimal and the published artifact is
total. The resolved half already exists in part — `dist/types/snapshot.json` carries the manifest,
provenance, facade types and flow helpers — and carries no inventory.

## The authored shape

711 lines → **310**. Three paths remain, each a genuine exception. Root is 13 keys.

**A feature declares what the filesystem cannot say, and nothing else** (185 lines → 61):

```jsonc
"threads": {
  "about": "Chat threads, their messages and the artifacts a conversation produces",
  "role": "threads",
  "entities": { "Thread": "ThreadEntity", "Message": "MessageEntity", "Artifact": "ArtifactEntity" },
  "opens": true
},
"flows": { "about": "Authoring and running flows" }
```

`be/system.ts`, `be/contract.ts#Contract`, `fe/plugin.ts`, `fe/contract.ts#Contract`, `settings.ts`,
`fe/references`, `be/types.ts`, each `be/services/<n>.ts`, each export of `be/repository/index.ts` — all
derived. `code`'s one exception is inline and feature-relative
(`"Terminal": "be/repository/index.ts#TerminalEntity"`), and `library` says `"SearchIndex": null` —
declared, no shape — rather than leaving it to omission.

**A step declares its metadata and how it runs:**

```jsonc
"llm":        { "arg": "prompt", "runs": "async" },
"keep_alive": { "runs": "waits" },
"kill":       { "label": "Kill Flow", "runs": "sync" },
"switch":     { "runs": "handler" },
"schedule":   { "kind": "trigger" }
```

`runs` collapses `{ handler: "<path>", isAsync | waits | sync | spawnsSubflow }` into one word. `dsl.custom`
goes entirely: `helpers.ts` existing is the same fact.

**An artifact or a block *is* its one fact:**

```jsonc
"artifacts": { "todo": "ListTodo", "diff": "GitBranch", "graph": "Network" },
"blocks":    { "markdown": "display", "approval": "input", "project-select": "input" }
```

**Content declares the exceptions; the inventory is not its job:**

```jsonc
"content": {
  "sources":  { "actions": { "onUserEdit": "offer" }, "notes": { "format": "notes" } },
  "datasets": { "faqs": { "format": "faqs" } },
  "formats":  { … }
}
```

## The resolved shape

`apack build` already compiles 90 actions and knows every label; it writes them to `dist/*.content.json`
and discards the inventory. The snapshot gains it:

```jsonc
"contributes": {
  "actions":  [{ "key": "claude-code/cc-command", "label": "CC: Run Command", "category": "claude-code" }],
  "flows":    [{ "key": "Onboarding Flow", "uses": ["Init Onboarding", "Handle Onboarding Response"] }],
  "features": { "threads": { "provides": ["system", "plugin", "settings", "references"],
                             "receives": ["AGENT_CONNECTED", "NOTE_CREATED"] } },
  "steps":    ["action", "llm", "schedule"]
}
```

Three things become available that are not today: `apack info` can list what a pack ships rather than
counting files; the host can answer "what does this pack contribute" at install time without loading it;
and a flow's action references become declared data, so renaming an action is checkable from the rename's
side rather than only from the flow's.

## The one decision to settle first

**Is `provides` derived or declared?** It is the fork the rest hangs on.

- **Derived** (what the example does): a feature entry is two or three lines, and the build reports a
  capability that appeared or disappeared between runs. A deleted `fe/references.ts` then silently removes
  a contribution unless that report is read.
- **Declared** (`goal-manifest-redesign`'s Decision 7): a missing file fails `validate` by name, at the
  cost of eleven lists that can be wrong in the other direction — the barrel problem, smaller.

The same fork applies to `services` and `repositories`, and it should be answered once for all three.
Nothing else in this plan depends on which way it goes.

## What this keeps and what it replaces

Against [`goal-manifest-redesign.md`](../goals/goal-manifest-redesign.md):

| | |
|---|---|
| keeps | 1 (sections), 2 (`path#export` as the one encoding — with far fewer paths to apply it to), 3 (entities onto the owning feature), 4 (relations as wire values), 8 (a key only when there is more to say than "it exists" — `opens`, `kind`, `runs` are exactly that), 9 (landed), 10, 11, 13 (`about`), 16, 17 |
| replaces | **7** — `provides` plus feature-relative paths becomes no paths at all. Phase 4 shrinks to `about`, `role` and the entity merge |
| untouched | 5 (volatile), 6 (`role`), 12 (landed), 14, 15 |
| adds | the resolved manifest as a first-class artifact; `runs`; `dsl.custom` derived from `helpers.ts` |

## The work

1. **Settle the fork above.** Everything else is mechanical once it is answered.
2. **One layout table per contribution kind**, in `@apack/sdk/build`, read by codegen, `validate`,
   `doctor` and `apack add` — the `FEATURE_LAYOUT` Decision 7 asks for, generalised to steps, blocks,
   artifacts, services, repositories and content. A spec fails when the documented table and the constant
   disagree.
3. **`contributes` in the snapshot**, written by the build from what it already computed, with each
   plugin's `receives` lifted out of the backend bundle. `apack info` reads it.
4. **The authored manifest**, in the shape of the example: default-setup, both fixture packs, the `apack
   init` scaffold, `packFixture`'s `DEFAULT_MANIFEST` and `generate-entries`' spec-support `manifest()`.
5. **`apack add` writes the short form**, and the canonical key order at all three levels (root,
   `extensions`, each feature).

## Footguns

- **18 block files need renaming to `<type>.vue`** for that convention to be total. `actions` and
  `toggles` are `kind: "input"` living in `display/` today, so the directory already lies about the kind
  and the manifest is the only thing that tells the truth.
- **`fire` and `switch` come out as `runs: "handler"`** — async handlers the brain does not await, so a
  rejection goes unreported. The example preserves it rather than changing behaviour; it reads like a bug
  and should be settled on its own.
- **A derived convention makes a typo an absence, not an error.** That is the fork's whole content, and it
  is worth paying for only if step 3 lands with it: the build's added/removed report is the check.
- **`$schema` completion is the author's safety net and gets better, not worse** — a shorter manifest means
  more of what remains is a constrained value (`runs`, `kind`, a block's kind, an icon name) rather than a
  free string, so the schema can enumerate it.

## Out of scope

- **A TypeScript manifest** (`apack.config.ts` with real imports, no `#export` at all). It is the obvious
  end point and the wrong move before step 3: the host must read a shipped pack's description without
  executing it, so the resolved artifact is a prerequisite rather than an alternative. Revisit once
  `contributes` exists.
- **Enumerating content in `apack.json`.** 90 hand-maintained lines with nothing keeping them honest is
  the barrel this repo deleted seven of. The file that lists what a pack ships should be the one nobody
  edits.

## Verification

- `npm run schema:check` clean with the regenerated schema committed; `npm run api:update` run.
- The generated tree does not move: `src/__generated__/ears.ts`, `pack-entry.ts`, `pack-entry-fe.ts`,
  `ref.ts` and `fe.ts` for default-setup are byte-identical across the change, which is what says the
  conventions resolve to the paths the manifest spelled out.
- Compiled content byte-identical (`dist/*.content.json`), so no pack re-applies on the next boot.
- `npm run chain`.
- Mutations: a feature whose `be/system.ts` is deleted is reported (by the build's diff, or by `validate`
  — whichever the fork chose); a step directory missing `build.ts` fails naming the expected path; an
  artifact naming an icon lucide does not export fails the pack's typecheck; a block whose `<type>.vue` is
  absent fails the build naming the block.
