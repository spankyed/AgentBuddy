# A pack contributes a published app-level fact

Status: deferred at one instance. The shell holds one fact sourced from a pack — the chat's slash
commands — and a mechanism for one instance is the thing that becomes twelve of them. **Revisit when a
second pack-sourced fact wants the same treatment**; that is the condition, and the seam below is what
makes the second one cheap enough to extract then rather than guess at now.

Compiled 2026-10-22 on `session/commands-to-the-editor`, after
[the commands goal](../../archive/goals/goal-commands-are-host-level.md) put the commands on the shell.

## What an app-level fact is

State a window needs whatever surface is open, which therefore belongs to neither a surface nor a
window. The shell holds three, and the third is the one that is new:

| fact | source | published by |
|---|---|---|
| `surfaceVisibility` | `AppState`, the host's own row | the host `application` system, on `SEND_STATE` |
| `PACK_RUNTIMES_UPDATED` | the registry's accepted runtimes | the same system, on the same event |
| `commands` | **a pack's rows**, interpreted by the feature playing the `commands` designation | the same system, reading the registry |

The first two are the host describing itself. The third is the host asking a pack a question and
publishing the answer, which is why it needed machinery the other two did not.

## What that machinery is, concretely

Five pieces, all of them small, and the reason to read them is that a second fact would want the same
five:

1. **A declaration naming a getter** — `features.<id>.commands`, a `"path#export"` the pack resolves at
   build time, carried on the feature's registration.
2. **A role that says whose getter** — `designation: "commands"`, so the app asks a feature rather than
   naming a pack, and a second claimant is refused by the designation store.
3. **The host publishing it** — a `sendCommands` action on the `host/application` system's `SEND_STATE`,
   which the bus already raises after every fact that could have moved it (a client connected, a pack
   changed, the data was replaced).
4. **An announcement for the cause publishing misses** — a user editing the rows while the app runs.
   The owner says only *that* the derivation moved (`COMMANDS_CHANGED`); the app reads it again.
5. **The shell holding it, typed** — a field on `HostShellState`, a `useShell()` ref for components and a
   plain read for code with no reactive scope.

## Why not generalise now

The cost of the concrete version is the five lines of wiring above, once. The cost of a mechanism is a
declaration shape, a registry projection, a publish channel keyed by fact name, a shell slot keyed the
same way, and a typed reader — plus the judgement call about what counts as a fact, which nobody can
make well from one example. `packages/apack-sdk/CLAUDE.md`'s note on the pack fixture records the same
reasoning for a different subject: a workspace per helper is the precedent that gets you twelve.

The honest read is also that **the second fact may not want this at all.** Two of the three facts above
are the host's own and need none of it, and a pack-sourced fact that a *surface* could hold instead
should be held there and read with `useSurfaceState`. The commands are on the shell because every editor
in the window needs them and no surface owns them — a narrow condition, and one a candidate has to meet
before this plan applies to it.

## The seam, so the second one is cheap

Four files, and a second fact touches exactly these:

- `packages/apack-sdk/src/framework/pack-registration.ts` — where a feature's contributed getter lives.
- `packages/apack-host/src/packs/registry.ts` — the view member that resolves the role to the getter.
- `packages/apack-host/src/features/application/be/system.ts` — the action that publishes it, and the
  event the owner sends to ask for a republish.
- `packages/apack-sdk/src/fe/shell.ts` with `features/application/fe/{machine,types}.ts` — the field the
  shell holds and the reader packs get.

Extract when the second fact has been wired through them by hand and the shape of both is visible. Not
before: what the two have in common is the thing worth factoring out, and one of them cannot show it.
