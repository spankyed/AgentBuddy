# An instance is a profile, and that is the only thing it is

Compiled 2026-10-09. A rename with no behaviour in it, to be landed **before**
[`attachable-dev-session.md`](attachable-dev-session.md) rather than inside it.

## Why now, and why not inside the attach work

`--instance` is about to *change meaning*: in the attach design it becomes the flag that decides **which
app `drive` talks to** — whether that is a live one it joins or one it starts is decided by liveness, not
by the flag, but the flag is what points at the data dir whose session file answers that. And a profile a one-shot
started an app in becomes something a reap can take, where today it only says where a throwaway app's
data goes. (No name is reserved by any of this — see the attach plan's Decision 12.) Renaming a flag in
the same change that changes what it does is the worst of both — a reviewer cannot tell which half of the diff is which, and a user meets a new name and
a new behaviour at once. So the rename goes first, alone, and the attach work is then written in the
vocabulary it will keep.

It is also the cheapest it will ever be: a mechanical rename the typecheck proves you finished, with no
API surface outside this repo to keep (root `CLAUDE.md`, "Backward compatibility"). The one thing that
*does* exist on disk is the directory itself, and it is **not** migrated: a one-shot rename reading the old
name is the kind of code nobody finds to delete afterwards, and what it would carry is disposable by
definition — a profile is "a data dir you can throw away". The old dirs stop being listed, which is a
sentence in the release note rather than a function in the tree.

## Three terms, which the rename is for keeping apart

| Term | What it is |
|---|---|
| **data dir** | the generic thing: a folder holding one app's whole state. One running app per data dir |
| **environment** | one of four *fixed* data dirs, by name — `abuddy`, `abuddy-beta`, `abuddy-dev`, `abuddy-test` (`APP_NAMES`). Nobody creates these |
| **profile** | an *extra* data dir under the CLI's own folder, created by name. Carries no environment |

An environment and a profile are both data dirs; that is the whole relationship. Keeping the third row's
name out of the way of the other two is what this change is.

## What is wrong with the word

**It is already taken, by the thing it is not.** An instance of an app is ordinarily a *running process*,
and Electron's own term is the single-instance lock — which is about a process, not storage. One sentence
in `abuddy-cli/src/commands/drive.ts` uses both senses at once: *"Electron's single-instance lock is scoped
to the data dir, so it cannot join an app `run` already has on that instance."*

**And the right word already describes it exactly.** `instances.ts`' own header says *"a data dir you can
throw away … It is a data dir and nothing more. `appName` stays `APP_NAMES[env]`, so the environment, the
Electron app identity and the URL scheme are untouched."* A named, disposable user-data-dir that leaves the
application's identity alone **is a browser profile**, and that is the analogy anyone reaches for when
explaining one — which is the tell that the word was wrong rather than the concept.

## The rename

| From | To |
|---|---|
| `--instance <name>` | `--profile <name>` |
| `abuddy instances`, `instances new\|rename\|rm` | `abuddy profiles`, `profiles new\|rename\|rm` |
| `src/app/instances.ts` | `src/app/profiles.ts` |
| `instanceFor`, `instanceInUse`, `mintInstance`, `listInstances`, `renameInstance`, `removeInstance`, `openInstance`, `parseInstanceFlags`, `INSTANCE_USAGE`, `OpenedInstance` | the same with `profile`/`Profile` |
| `<cli data>/instances/` | `<cli data>/profiles/` |
| `E2E_DATA_DIR` | unchanged — it is a path, and says so |

**One behavioural line comes with it, because it is the same surface and the same review:** `--fresh` and
`--ephemeral` both mint a new dir and differ only in whether it survives the command, which is two flags
for one concept and a boolean. They become `--fresh` and `--fresh --rm`, so "a new one" is one flag and
"and throw it away" is the modifier it reads as — the spelling `docker run --rm` made ordinary, for
exactly this meaning.

**What does not change.** The four environments, `APP_NAMES`, `resolveAppContext`, any stored layout, and
the `-d`/`-b`/`--production` flags on `db`, `install`, `list` and `uninstall`. Whether those flags should
name a *build* rather than an environment, so that "beta" means one thing everywhere, is the larger
question and is [the last of the three phases](one-storage-axis.md) rather than part of it. **This rename does
not prejudge it**: it names the override, and leaves what the defaults are called alone — a profile named
after a build is exactly what that plan rejects, so none is introduced here.

## Files

| File | Change |
|---|---|
| `abuddy-cli/src/app/instances.ts` → `profiles.ts` | the module, its exports, the directory name, and the one-time rename of the old root |
| `abuddy-cli/src/commands/instances.ts` → `profiles.ts` | the command; `index.ts`'s `COMMANDS` and `USAGE` |
| `abuddy-cli/src/commands/{run,drive}.ts` | the flag, the usage text, `--fresh --rm` |
| `abuddy-cli/src/commands/db/target.ts` | `--instance` is one of its target flags (20 mentions), and `output.ts` prints the resolved target |
| `abuddy-cli/src/commands/clean.ts`, `doctor.ts` | both name `abuddy instances` in what they print — `clean` in the message that redirects the flag it used to take |
| `abuddy-cli/src/index.ts` | `COMMANDS` and the `USAGE` lines |
| `abuddy-cli/src/app/instance-secrets.ts` → `profile-secrets.ts` | `copySecretsInto` is unchanged inside |
| `abuddy-cli/tests/app/`, `tests/commands/` | the specs that name the flag or the module |
| `abuddy-testing/src/index.ts` | the comment at `:350`; the package is in the rename's scope, not only the CLI |
| prose | `abuddy-cli/CLAUDE.md`, `docs/public-facing/cli.md`, `drive/README.md`, root `CLAUDE.md` where it names the flag, `abuddy-testing/CLAUDE.md:514` (`E2E_DATA_DIR`, "set by `abuddy drive` for an instance") and `tests/e2e/CLAUDE.md:181` (which documents the flag) |

## Verification

A rename is held by the typecheck, so what needs a case is only what a rename cannot prove:

- **nothing reads the old directory.** `<cli data>/profiles/` is the only root, and no constant, branch or
  one-shot rename names `instances/` — which is the half worth checking, since a migration is easy to add
  and hard to find again later.
- **`--fresh --rm` removes what `--fresh` keeps.** Two cases, since the second flag is the whole difference.
- **no `instance` left in a user-facing string**, which is a scan and therefore the safe direction: a false
  finding is a word in a comment, where a missed one is a flag nobody can find. The scan needs the sense
  separated from the word: `err instanceof Error` and *"two instances of Vue"* are not this concept, so it
  reads the strings a command prints and the flags it parses, not every occurrence. **Its population is
  the repo, not this package** — three of the sites are in `@abuddy/testing` and in `tests/e2e`, which a
  CLI-scoped scan would pass over.

Then `npm run spec packages/abuddy-cli` and `npm run chain`.
