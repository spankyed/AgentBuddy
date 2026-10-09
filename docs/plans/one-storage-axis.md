# One storage axis: a build, and the profile it keeps its data in

Compiled 2026-10-09. Lands between [`profiles-not-instances.md`](profiles-not-instances.md) and
[`attachable-dev-session.md`](attachable-dev-session.md), so the largest of the three is written once, in
the vocabulary it keeps.

## The confound

**"Environment" does two unrelated jobs**, and `--profile` splits them:

- **identity** — the app name, the URL scheme, the channel a packaged build stamps
- **location** — which data dir

They are fused in `platformDataDir(APP_NAMES[env])` and then come apart the moment a profile is named,
which overrides the location and leaves the identity alone. So the word means identity in one sentence and
location in the next, and a reader cannot tell which without checking.

It is already half-split by the app itself: *"a packaged build stamps its own channel and ignores
`ABUDDY_ENV`, where `ABUDDY_USER_DATA_DIR` reaches it"* (`abuddy-cli/src/app/profiles.ts`). Identity
follows the binary; storage follows the flag.

**A second-order symptom**, and the one that shows up in use: the same word selects a different axis per
command. `abuddy db -b` names *a data dir*. `abuddy run --app beta` names *a binary*, whose data dir then
follows unless a profile says otherwise. Same "beta", different thing chosen.

## The shape of the fix

**`--build` names a build. `--profile` names storage instead of that build's default. Nothing else names
either.**

```
abuddy db   --build beta                  the data dir the Beta build uses
abuddy db   --profile probe               a profile, instead of any build's default
abuddy dev  --build beta                  the Beta build, in its default dir
abuddy dev  --build beta --profile probe  the Beta build, in probe
abuddy dev  --build ./my-checkout         a checkout, by path
```

**One flag, not two, because `--app`/`--app-root` were never two concepts.** They split on the *shape of
the value* — a name or a path — and the name half accepts exactly one word:

```ts
if (flags.app !== undefined && flags.app !== 'beta') throw new Error(`Unknown --app "${flags.app}" (supported: beta)`);
```

So the disambiguation rule is one line — a value in the known-name set is a build, anything else is a
path — and with one reserved name it cannot be ambiguous today. `./beta` says "the directory" the way it
does in every other tool, which is the escape hatch for the day a checkout is named after a channel. The
collapse also leaves room for `--build production` or `--build 0.3.14` without a third flag, where the
current schema would need one. `ABUDDY_APP` and `ABUDDY_ROOT` collapse the same way and for the same
reason, into one variable holding either shape.

**`build`, because it is the only word that covers all four.** "Channel" does not: `development` and
`test` are not releases. A build is what each of the four is, and the word keeps one meaning across the
CLI — `abuddy build` *produces* one, `--build` *selects* one. The command keeps its name; `compile`, the
only alternative, collides with `compilePack`, the content-compile step *inside* a build.

A build keeps its own default storage, which is the fusion kept where it is harmless: it is a *default*,
stated once, rather than a second meaning the word carries everywhere. `--profile` is the override and
the only one.

**No profile is ever named after a build**, which rules out the version of this that reads as right:
making the four environments *built-in profiles* — `--profile production | beta | dev | test`. That
renames the slots and leaves the collision in the value, since `--profile beta` and `--build beta` would
still say "beta" and mean a folder and a program; and a profile would only be *called* `beta` because the
Beta build stores its data there, which is the fusion this plan exists to end, surviving inside the value.

So `-d`/`-b`/`--production` become `--build` spellings rather than profile shorthands, and
`resolveAppContext` takes a build and an optional profile rather than deriving a directory from an
environment name.

## What makes it the middle phase

- It touches `resolveAppContext`, which every package reads, where the rename before it touches one
  package's surface — so it goes second, not first.
- It has one real open question, which is the actual reason: **what `-d`/`-b` become** on `db`, `install`,
  `list` and `uninstall`. They name a data dir today and would name a build, which reads better
  (`abuddy db --build beta` says *whose* data, where `-b` names an environment `db` never launches) — but
  it changes what those commands *mean*, not how they are spelled, and that is a decision rather than a
  rename. **The axis's name is settled**: `build`, for the reasons above.
- The attach work does not depend on it, but is written against its vocabulary: doing it after would mean
  rewriting that plan's flag handling and its `resolveAppContext().env` security gate a second time.

## Evidence it is already costing something

**Two guides state a load-bearing fact differently**, because the thing has two identifications:

- `packages/main/CLAUDE.md`: the single-instance lock is *"scoped by the app name `initAppContext` set"*
- `abuddy-cli/src/commands/drive.ts`: *"Electron's single-instance lock is scoped to the data dir"*

The source commits to neither — `SingleInstanceApp.ts`: *"App name and userData are set by
`initAppContext()`; the lock is scoped to **them**."* Those are the same claim only while the name and the
directory are fused, and they come apart whenever `ABUDDY_USER_DATA_DIR` is set: every profile, every
drive session, every E2E worker. **Settling which is true is part of this work**, because "can two apps
coexist here" is the question an attach, an autostart and a profile refusal all turn on.

## What to read first

`abuddy-sdk/src/env/index.ts` (`APP_NAMES`, `appDataDirFor`, `resolveAppContext`),
`abuddy-cli/src/app/profiles.ts` and `app-target.ts`'s `appEnv`, `parseAppFlags` and `namedApp` — the one
place `--app`/`--app-root` are parsed, and the precedence ladder `--build` inherits, which loses a rung
when the two flags become one.
