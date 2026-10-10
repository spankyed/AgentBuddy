# CLI Reference

The `abuddy` CLI manages the full pack lifecycle: scaffolding, code generation, building, validation, testing, releasing and installation. It also reads and repairs the app's database (`abuddy db`).

## Installing

- From the app (macOS): **AgentBuddy → Install 'abuddy' command in PATH**. It links `/usr/local/bin/abuddy` (`abuddy-beta` for AgentBuddy Beta) to the CLI bundled with the app, which runs on the app's own Node runtime.
- `npm i -g @abuddy/cli`
- Homebrew: `build/homebrew/abuddy.rb`

Packs pin `@abuddy/cli` in `devDependencies`. Any `abuddy` run inside a pack hands off to that pinned version.

## Commands

### Scaffolding

#### `abuddy init [name]`

Create a new pack from scratch. `name` is the pack id: lowercase letters, digits and hyphens (prompted for when omitted). The directory must not exist.

```bash
abuddy init my-pack
```

Creates no feature (add one with `abuddy add feature`). It writes:

- `abuddy.json`: one entity type named after the pack, empty `features`, `dependencies` and `permissions`, `steps` with `register` and `build` barrels, and `content.sources` with `actions`, `flows` and an `examples` entry using the `examples` content format (`markdown-tree`)
- `package.json` (depends on `@abuddy/sdk`; pins `@abuddy/cli`, `@abuddy/testing`, `vitest`, `typescript`), `tsconfig.json`, `.gitignore`, `src/env.d.ts`
- `.github/workflows/release.yml`: publishes the GitHub release when `abuddy release` pushes a `v*` tag
- `src/extensions/steps/register.ts` and `src/extensions/steps/build.ts`
- `src/content/actions/`, `src/content/flows/`, `src/content/examples/hello.md`
- `vitest.config.ts`, `tests/setup.ts` (the `@abuddy/testing/harness` setup) and `tests/<name>.spec.ts`

Then runs `generate` and `generate-entries`.

#### `abuddy add <entity> <name> [options]`

Add an entity to an existing pack. Run from inside a pack directory. Names other than a feature's are kebab-case (`^[a-z][a-z0-9-]*$`). Existing files are never overwritten.

| Entity | Command | What it creates |
|---|---|---|
| Feature | `abuddy add feature <name> [--label <Label>] [--icon <Icon>] [--designation <role>]` | See below |
| Step | `abuddy add step <type> [--trigger]` | `src/extensions/steps/<type>/{build.ts,index.ts,fe.ts,types.ts,form.vue}` (`types.ts` declares `DSL<Type>Node` and `<Type>Node`); adds the step to the `steps.register` barrel (and `<register>-fe.ts` if it exists), its build facet to the `steps.build` barrel, and a `steps.definitions` entry |
| Artifact | `abuddy add artifact <type> [--icon <Icon>]` | `src/extensions/artifacts/viewers/<type>-artifact.vue`; when the manifest declares `artifacts`, adds `{ type, fe: { icon } }` to that register file and the viewer to its `-fe.ts` `componentMap` |
| Block | `abuddy add block <type> [--input]` | `src/extensions/blocks/display/<Type>Block.vue` (or `input/<Type>Input.vue`); updates the `blocks` register file and its `-fe.ts` when the manifest declares `blocks` |
| Action | `abuddy add action <name> [--category <cat>]` | `src/content/actions/<category>/<name>.ts` (category defaults to the pack id) |
| Prompt | `abuddy add prompt <name>` | `src/content/prompts/<name>.ts` |
| Flow | `abuddy add flow <name>` | `src/content/flows/<name>.ts`. Needs a dependency that provides flow steps (e.g. `default-setup`) |
| Service | `abuddy add service <name> [--feature <feature>]` | `src/extensions/services/<name>.ts` in `packServices`, or `src/features/<feature>/be/services/<name>.ts` in that feature's `services`. The key is the camelCased name, the value `path#<camelName>Service` |
| Migration | `abuddy add migration [version] [--version <ver>]` | `src/migrations/<version>.ts` exporting a `PackMigration`, added to `src/migrations/index.ts`; sets `migrations` if unset. Version defaults to the manifest's |

Only `add feature`, `add service` and `add step` update `abuddy.json` entries and run `generate-entries`; `add migration` only sets `migrations`, and the rest just write files. In a pack whose dependencies aren't installed yet, `generate-entries` can't read a system's events through `@abuddy/sdk`: the files and `abuddy.json` are still written, and `npm install` regenerates the entries (the pack's `prepare` script).

**`add feature`.** The name is the feature id: a lowercase letter, then letters and digits (`notes`, `calendarEvents`), because it becomes an identifier in generated code. `--designation`, if given, must equal the name. It creates:

- `src/features/<name>/settings.ts`
- `src/features/<name>/be/system.ts`, `be/contract.ts` (the system's contract, which `abuddy.json` names), `be/types.ts`, `be/repository/index.ts`
- `src/features/<name>/fe/plugin.ts`, `fe/state.ts`, `fe/canvas/list.vue`, `fe/settings.vue`
- `tests/features/<name>/be/system.spec.ts` (and `tests/setup.ts` with its devDependencies if the pack has none)

and adds a `features[]` entry with `settings`, `system.entry`, `plugin` (`entry`, `label`, `icon`), empty `services`, and `repositories` `<name>Queries` and `<name>Commands` pointing at `be/repository/index.ts`.

### Code generation

#### `abuddy generate-entries`

Read `abuddy.json` and generate all files in `src/__generated__/`. Uses input hashing to skip when the manifest and template haven't changed. Pass `--force` to regenerate unconditionally.

#### `abuddy fetch-deps`

Resolve every dependency and cache its snapshot, build code and backend runtime in `.abuddy/deps/<id>/`. Resolution order:

1. `file:` path: read directly, never cached, no fallback
2. The workspace: in each directory above the pack, nearest first, `packages/<id>` then `<id>`. A pack anywhere inside an AgentBuddy checkout builds against that checkout's packages
3. The app this pack is built against (`ABUDDY_BUILD=beta`, `ABUDDY_ROOT`, or the AgentBuddy checkout behind the pack)
4. Installed AgentBuddy apps' built-in packs (production, beta, development, test data dirs)
5. GitHub releases, for `github:owner/repo` values (the `<id>-<version>.tgz` asset and its `.sha256`)

Sources 2–5 must satisfy the declared range, and every source must carry a snapshot in the format this CLI reads; a build in another format is passed over, and reported if nothing else resolves. `abuddy build` resolves the same way but uses the `.abuddy/deps` cache, while it satisfies the range, before going to GitHub. See [Manifest Reference — Dependencies](manifest.md#dependencies) for the value formats.

### Building

#### `abuddy build [--skip-generate] [--skip-fe] [--release]`

External packs build into `dist/` in the pack layout:

```
dist/
  runtime/index.cjs          backend: systems, services, steps, boot hooks, migrations
  runtime/fe.js, fe.css      frontend
  runtime/content/             compiled content
  build/steps.build.mjs      step build facets, for dependents' flow validation (with steps.build)
  build/content-runtime.mjs     entity types, repositories and content writers, for dependents' unit tests
  build/content-compilers.mjs   content format compiler modules (with content.formats[].compiler)
  types/pack-types.d.ts      facade types for dependents
  types/snapshot.json        types, facade types, flow helpers, manifest, SDK version
  defs/monaco/<name>-defs.d.ts  editor definitions per dsl entry with a monaco target
```

Steps:

1. Validates `abuddy.json` and fails on an invalid manifest
2. Clears `dist/`
3. Runs `generate` + `generate-entries` (skip with `--skip-generate`)
4. Checks each feature's `settings` file exists and sets only `plugins.<id>` and `visible`
5. Resolves every dependency (fails if one can't be), and warns when `src/__generated__` holds a dependency's types from a different version than the one the build resolved
6. Compiles `content.sources` into `runtime/content/`, validating flows against the dependencies' step build code
7. Bundles the facade types and **gates** them: `types/pack-types.d.ts` must type-check on its own and import only `@abuddy/*` packages, `@abuddy/sdk`'s peer dependencies and Node built-ins, with declarations; otherwise dependents would read the types as `any`. Warns, without failing, when a committed `etc/pack-types.api.md` no longer matches what it bundled (`abuddy facade-report`)
8. Writes `types/snapshot.json`, and notes entity types with no `entityShapes` entry
9. Bundles `steps.build`, the content runtime and any content compilers into `build/`. The content runtime is then loaded in a fresh Node process with only `@abuddy/sdk`, as a dependent's tests load it; it fails if repositories or content writers need native modules or `@abuddy/sdk`'s optional peers
10. Bundles the backend runtime into `runtime/index.cjs`
11. Bundles each `dsl` entry with a `monaco` target into `defs/monaco/<name>-defs.d.ts`, wrapped as `declare module "@app/defs/<name>"`, inlining the pack's own modules, `@abuddy/*` and the entry's `inline` packages
12. Bundles the FE entry into `runtime/fe.js` (and `fe.css`) with Vite, unless `--skip-fe`. The entry is `src/pack-entry-fe.ts` (or `.js`) if present, else `src/__generated__/pack-entry-fe.ts`

Bundle and gate failures are all reported, and the command exits with code 1. `--release` minifies and drops source maps.

A build also writes `.abuddy/reads.json`: the files each bundling phase read, as esbuild, Rollup and Vite report them, keyed by phase and relative to the pack. It is the build's own record of its inputs — what a build system calls a dep file — for a cache or a CI check that wants to know whether what it declared covers what the build touched; the build never reads it back, and a phase that didn't run is absent rather than empty. `ABUDDY_NO_BUILD_READS=1` turns it off, for a read-only tree.

A build resolves the pack's `@abuddy` packages to the `dist` each published package ships — the one layout a pack ever has, whether the packages came from the registry or from a link to an AgentBuddy checkout. There is nothing to configure, and a pack's own configs set no resolution conditions. `abuddy test` and `abuddy dev` resolve the same way, so a pack's tests run against what its build compiled; against a checkout they first bring that `dist` up to date with the checkout's sources.

#### `abuddy pack [--out <dir>]`

Stage the built `dist/` into a verified pack (`integrity.json` lists a sha256 per file) and write `<id>-<version>.tgz` and `<id>-<version>.tgz.sha256` to `--out` (default: the pack root). Run `abuddy build` first (`--release` for publishable output). Refuses built-in packs and invalid manifests.

#### `abuddy dev`

Launch AgentBuddy with your pack installed and keep it in step with your edits.

It picks an app the way you tell it to — `--build <path>` for a local AgentBuddy checkout, `--build beta` for a Beta that satisfies your `hostVersion` (a downloaded one if you have it, the newest otherwise) — and **with neither it works one out rather than asking**: the AgentBuddy checkout your pack is built against, if there is one, else that newest Beta. Nothing is remembered, nothing is asked, and it prints which app it chose and which rule chose it.

Deriving the checkout is the right pairing rather than a convenience: a pack whose `@abuddy/*` resolve into a checkout is *compiled against that checkout's packages*, so running it inside a released Beta would pair source-built pack code with a released host. If that checkout is not built, `dev` says so and names `npm run build` instead of quietly using a Beta you were not built against.

`abuddy test` deliberately derives nothing — it pins from your `hostVersion` — so a test run means the same thing on a fresh machine as on one you have been developing on.

The environment follows the app: a checkout runs as `development`, and a packaged Beta runs as `beta`, because a packaged build stamps its own channel. Neither touches production data.

**Profiles.** By default `dev` uses the shared development data dir, so every run inherits what the last one left. A profile is a data dir of its own, created on demand:

- `--profile <name>` — that one, created the first time you name it, and kept
- `--fresh` — a new one, whose name is printed so you can come back to it with `--profile`
- `--fresh --rm` — the same, removed when the command exits
- `--profile <name> --rm` — the same for a name you choose. It removes only a profile **this run creates**: one that is already there holds data you kept, so the flag is refused rather than quietly ignored, and `abuddy profiles rm <name>` is what removes that one
- `--with-secrets` — copy the secrets this environment already holds into the **new** profile, so a throwaway run can use them without you entering anything again. The values are encrypted in the profile's own data dir, and the data key that decrypts them goes in a file beside them rather than the OS credential store, so `rm -rf` removes both; that also means they are protected by file permissions alone, which is the trade every profile makes and which Settings states

A profile is self-contained — its data, packs, logs and secrets are all inside it, and the data key that encrypts its secrets goes in a file beside them rather than into the OS keychain, which is shared by every app of one channel. So `rm -rf` is the whole cleanup, and `abuddy profiles rm <name>` does it for you. The path is printed, and `abuddy db --profile <name>` opens its database — by the same name `dev` and `profiles` show, throwaway ones included.

A profile is a data dir and nothing else: the environment, the app's identity and the URL scheme are untouched, so `--build beta` and a local checkout can both run the same profile. **The word is `profile` rather than `instance` because an instance of an app is a running process** — which is what Electron's single-instance lock is about — where this is storage, and a named, disposable data dir that leaves the app's identity alone is what a browser calls a profile.

An app already running on that data dir is used as it is; otherwise `dev` starts one, and closing `dev` closes the app it started. It then builds, installs the pack into that app's data dir, and:

- serves the FE entry from a Vite dev server (port 5199, or the next free one) with HMR, recording its port in `pack-dev-servers/<id>.json` in the app's data dir so the app's `pack://` requests go to it. The marker sits outside the installed pack, which stays exactly the verified files, and is removed when `abuddy dev` exits
- on `abuddy.json` changes, regenerates `src/__generated__/`
- on `.ts` changes under `src/`, rebuilds, reinstalls and asks the running app to reload the pack's backend

Without an FE entry it rebuilds, reinstalls and reloads on any change instead.

#### `abuddy drive [script | --eval <body>] [--build <name|path>] [profile flags]`

Launch AgentBuddy and drive it from a script: navigate, send events, read state, take screenshots.

**This is mainly for an agent.** It is how a coding agent debugs and develops against the app it is changing — open the thing it just built, click through it, read the state back, screenshot it, and see for itself whether the change worked. A person can use it the same way, and the app's windows are shown so you can watch, but the reason it exists is that an agent has no other way to look at a running app.

**It is not testing, and nothing treats it as testing.** A driving script asserts nothing, nothing gates on it, and no test runner collects it. Scripts live in `drive/`, which `abuddy drive` creates the first time you run it, and which sits outside every test glob by construction rather than by exclusion. `abuddy test` never sees it.

```ts
// drive/notes.ts
import { drive } from '@abuddy/testing';

drive('open notes and look at it', async ({ app, appPage }) => {
  await app.navigate('notes');
  await app.screenshot('notes');
  // appPage is a Playwright Page: click, type, evaluate — whatever you need
});
```

The import is `drive`, not `test`: the same runner under a name that says what the file is. With no script argument every file in `drive/` runs; name one to run just it.

##### One question, many times

A driving script is a closed program. It runs, it ends, and the next question costs another edit and
another app launch. So a question is asked of the app `abuddy dev` is already holding, over the debug port
that app published — one process per question, no session to stand up and nothing to tear down.

```bash
abuddy dev                                   # one terminal: holds the app
abuddy drive --state                         # another: 0.9s
abuddy drive --eval 'return window.appVersion'
abuddy drive --query 'return qx(EARS.Entity.Note).count()'
```

With no app running it exits 3 and says so. `--spawn` starts one and keeps it, so a cold checkout costs
one flag on the first question and an attach on every one after.

**This replaced a session that answered HTTP** — an address, a token, a marker file and a `/close` verb.
Its attach was quicker, 0.7s against 0.9s measured on one box, and what the 0.3s bought was the removal of
a second long-lived app beside the one `dev` already holds.

**Three rules, so a verb is guessable.** A POST is a verb and a GET is a noun; one concept has one field
name, in requests and in responses (`code` is any source the session runs, `plugin` names a plugin
whichever direction it travels); and every answer is `{ ok, value }`, or `{ ok: false, error }` when the
operation failed — a `4xx` means nothing ran at all.

| verb | method | body | does |
|---|---|---|---|
| `/eval` | POST | `{ code }` | runs the code in the window and returns what it returns |
| `/send` | POST | `{ event, to? }` | sends an event to a system by ref, or to the app's root actor without `to` |
| `/query` | POST | `{ code }` | runs query code against the live database |
| `/transact` | POST | `{ code }` | runs transaction code against the live database |
| `/state` | GET | — | the state value, the active `plugin` and the `plugins` list |
| `/wait` | POST | `{ state }` or `{ plugin }`, `{ timeoutMs }` | waits for a dotted state path, or for a plugin to arrive |
| `/navigate` | POST | `{ plugin }` | opens a plugin |
| `/plugin` | POST | `{ plugin, path? }` | what that plugin published, or one dotted path into it |
| `/click` | POST | `{ selector }` | clicks what it matches |
| `/fill` | POST | `{ selector, text }` | types into it |
| `/press` | POST | `{ key, selector? }` | a key, to an element or to the page |
| `/snapshot` | GET | — | the page as an accessibility tree |
| `/logs` | POST | `{ since?, source? }` | the app's own log, after a line you saw and from one source |
| `/settings` | GET | — | the settings as stored: what the user changed from the defaults |
| `/viewport` | GET | — | the size the app is rendering into |
| `/set-viewport` | POST | `{ width, height }` | changes it |
| `/set-setting` | POST | `{ plugin } or { section }`, `{ path, value }` | writes one setting |
| `/screenshot` | POST | `{ name }` | writes `drive/screenshots/<name>.png` |
| `/reload` | POST | — | reloads the window and returns once it is connected again |
| `/events` | POST | — | the app's events since you last asked, and how many were dropped |
| `/drops` | POST | — | sends the bus dropped, and clears them |
| `/errors` | POST | — | renderer errors, and clears them |
| `/close` | POST | — | ends the session and shuts the app down |

**`/snapshot` is usually what you want over `/screenshot`.** It answers with the page as text: readable,
diffable, cheap, and it says what a thing *is* rather than where it is. `/screenshot` is for a person
looking at the result afterwards.

**`/settings` answers with the *stored* document**, not the effective one: it is what a write lands in, so
it is what says whether your write landed. The defaults it is merged over are the registry's.

**A refused write answers `ok: false`, with the reasons.** The settings store checks the whole next
document and refuses what it will not take — an unknown feature ref, a section nobody registered, a change
while a backup is being imported — and `/set-setting` waits for that answer rather than for the send to be
accepted. It used to resolve on the send, so every refusal read as success.

**`/set-setting` writes either half of that document.** A feature's settings live under its ref
(`{"plugin":"default-setup/code"}`) and a pack's section lives at the top of it
(`{"section":"general"}`) — one of the two, never both, as `/wait` takes one of its two. Writing only
features left `general` and `assistant` readable and unwritable.

**`/set-viewport` resizes whichever thing the run actually has.** A session whose window is shown — a
person watching `npm run drive` — has its *window* resized, because a viewport Playwright sets is an
emulation inside the window: the app would draw into one corner and leave the desktop showing through the
rest. A session nobody is watching gets that emulation, which is what makes a suite's layout the same
everywhere. Either way `/viewport` answers with what the layout has, read from the window.

**`/plugin` over `/eval`.** A plugin's state is what its view is showing, so reading it is the commonest
question there is; doing it through `/eval` means writing the same expression, with the same ref and the
same optional chain, every time.

The three drains are POSTs because each one *clears* what it returns: draining is right for a session open
for an hour, but a GET that answers differently on a retry is a trap.

**A write does not update the UI; `/reload` is how you see it.** A plugin's state is what its system
sent it, so a write made outside that system — `/transact`, the database console, `abuddy db exec` — changes
the database and reaches no view. That is the console being a console rather than a fault, and it is not
staleness that time fixes: navigating between plugins does not refresh one, because the plugin's actor
survives. `/reload` does, because a new connection makes every system send its startup data again.

`window.location.reload()` from `/eval` is not an alternative. The app blocks renderer-initiated
navigation, so it returns having done nothing — which reads exactly like a reload that changed nothing.

**`/wait` rather than re-asking `/state`.** `{"state":"running.connected"}` returns when the app gets
there; `{"plugin":"default-setup/notes"}` returns when that plugin registers. One of the two, never both.

**Replies come to the session, and each names the request it answers.** Both matter. The session has its
own connection to the app and a name on it, so an answer is addressed here rather than to every window —
a person querying in the Database plugin while you drive is no longer mistaken for you. And because three
concurrent `/query` calls would otherwise be indistinguishable, each reply still names its request, so they
may run together and one you stopped waiting for is ignored.

**`/query` and `/transact` reach the live database**, not the files on disk — they go to the running app, so a
write is visible to the next read in the same session. `abuddy db exec` cannot do that: it refuses while
the app holds the write lock.

**A failed verb answers `200` with `{ "ok": false, "error": ... }`** — the request was fine and the
operation was not, which is the common case while driving. A malformed request, a missing token or an
unknown verb answers `4xx`, because nothing ran.

The app's own output is in `drive/results/app-0.log` for the whole session, so there is nothing to stream.

##### One question

A script and a session both assume you have more than one question. For the first one — and often the only
one — `--eval`, `--query` and `--state` launch the app, ask the session one thing, print it and exit:

```bash
abuddy drive --eval 'return document.title'
{"ok":true,"value":"Agent X"}
```

The answer is the same `{ ok, value }` envelope the HTTP verbs return, as **one JSON line on stdout and
nothing else there**, so `$(abuddy drive --eval …)` is directly parseable; the app's output goes to stderr
and the exit code is the status. It runs headless, since nothing is watching a single question.

`--eval` takes a function **body**, not an expression, so `return` is required and a body without one
answers no value at all.

**With no `abuddy.json` above it, it drives the app of the AgentBuddy checkout it is in** rather than a
pack: nothing is built or installed, and the app is that checkout's — which is the same rule as for a
pack, since the checkout behind "no pack here" is the one you are standing in. Naming `--build` or
`--build beta` still overrides it. That is the mode the
AgentBuddy repo's own `npm run drive` scripts use, so they are calls to this command rather than a second
implementation of it.

It takes the same app and profile flags as `abuddy dev`, with one difference in the default: where `abuddy dev` uses the shared development data dir, `abuddy drive` gives each session a fresh one and throws it away afterwards, so a driving session starts clean and leaves nothing. `--profile <name>` is how a session keeps its state for the next one. It launches its own app rather than joining one `abuddy dev` already has, because Electron allows one app per data dir — so if a person wants to watch what a driver is doing, they watch the driver's window rather than starting a second app.

### Which app, and how long it lives

| What you run | The app it uses | When it closes |
|---|---|---|
| `abuddy dev`, `npm start` | starts its own | when you stop the command |
| `abuddy drive --eval` (and the other one-shots) | a live one; **fails if there is none** | it was not yours to close |
| the same, with `--spawn` | a live one, else it starts one | **it stays for the next question** — and, on a profile, closes itself after 10 minutes with nothing attached |
| `abuddy drive <script>` | always its own | when the script finishes |
| `abuddy test` | always its own, isolated | when the run finishes |

**A question keeps the app so the next question is cheap; a script closes it so its result does not depend
on what the last one left behind; and a question never starts one unless you asked.** That is the whole
rule. Measured on a checkout: `--spawn` and the first answer together, 3.3s; every question after it, 0.9s.

Only one app can run per data dir, which is why `drive` joins yours rather than competing with it, and why
`--profile <name>` is how you get a second one.

**A one-shot's stdout is one JSON object and nothing else**, so it pipes:

```
{"value":"0.3.14","state":"attached","startedBy":"dev","supervisorPid":75415}
```

`value` is the answer, `state` is `attached` or `spawned`, `startedBy` says whose app answered, and
`supervisorPid` is what ends it. The exit code is the status, and there are three: **0** with a value,
**3** when no app is running, **1** when the verb failed. Those last two are different answers — a miss is
worth retrying with `--spawn` and a failed verb is not — and neither puts anything on stdout, so a pipe
never receives half an answer.

A run that **started** an app says so on stderr and names the two ways to end it: `abuddy dev`, which takes
the directory back, or the `supervisorPid` above. An attach that changed nothing says nothing, because the
fields already said it.

**And nothing is left running forever.** Which of the two applies depends on where the app is, because the
two cases have different answers:

- **On your development data dir** — a `--spawn` with no profile flags — the app stays until you take the
  directory back, which `abuddy dev` and `npm start` do for you: they close the one a question started,
  say so, and start yours. So there is nothing to remember, and no timer closes an app you may be watching.
- **On a profile** — `--profile <name>` — nothing reclaims it that way, so the app closes itself after **10
  minutes** with no question attached. Each question resets that, so a session you are working in keeps
  its app; one you walked away from gives the data dir back. It tells you at launch, and says why in its
  log when it goes.

`abuddy profiles` lists every data dir with a live app, who started it, and the pid that ends it — which is
the answer when a terminal has been scrolled away and you want to know what is still up.

### Validation

#### `abuddy validate`

Checks:
- Manifest structure validation
- Each `features[]` entry against the pack: its `settings`, `system.entry` and `plugin.entry` files exist, and no two features claim the same `designation`
- Dependency resolution (a warning when one can't be resolved)
- **What your pack's code may say** — the same rules `abuddy build` refuses on, reported here without building:

| Rule | What it refuses | Switchable? |
|---|---|---|
| `contract-leaves` | a contract that reaches its own machine (`./state.ts`, `./system.ts`), another feature, or generated code beyond `#generated/types` and `#generated/ears`. Codegen reads a contract as a declared type before it writes anything, so a contract whose read positions resolve through the machine collapses to `any` and the build fails for good — and one that resolves anyway ships the machine's whole declaration in your published facade | no |
| `source-resolution` | a `tsconfig.json` or Vitest config of yours that resolves a checkout's `@abuddy` source instead of the published `dist` — esbuild and the pack bundler read `dist` either way, so such a pack typechecks against one thing and ships another | no |
| `own-modules` | a specifier that names no file: `#generated/events` or `#generated/events.js` where the file is `events.ts`, and a relative `./x.js` whose source sibling is `./x.ts`. No runtime resolves an extensionless specifier in ESM, and a pack ships one bundle rather than a module per source | no |
| `pack-own-aliases` | `@/…`, a TypeScript-only `paths` mapping no runtime reads. Name your own modules with `#` subpath imports from your `package.json` | no |
| `internal-package-imports` | an `@abuddy` export named `_x`: it is `@internal`, the app's own, and an app update is free to rename it | no |
| `host-imports` | `@abuddy/host`, which is not installed for a pack | no |
| `lmdb-imports` | `lmdb` or `@abuddy/ears/lmdb`: your data comes through the engine the app installs | no |
| `untyped-sends` | `untypedBroadcastToPlugin`, `untypedSendToSystem`, `registerRepository` — use the typed facades from `#generated/events` | yes |
| `raw-transport` | `_rootEvents`, `trpc.bus`, `@abuddy/sdk/rpc` | yes |
| `backend-console` | `console.*` under `features/*/be/`, `migrations/` or `extensions/` — use `createLogger` from `@abuddy/sdk/logger` | yes |
| `component-sends` | `sendToPlugin` from a feature's `.vue`. A component runs in no delivery, so the send carries no `Message.sender` and the plugin it reaches cannot answer it — emit to your own plugin with `usePlugin()` and let its machine send. An extension's component is exempt: it is rendered in no plugin scope and by no single plugin, so it addresses a plugin by ref and `sendToPlugin` is that route's send | no |
| `cross-feature-imports` | a module of another feature's `fe/`, and a feature passing its own frontend on (`export … from './fe/state.ts'`). What a feature offers the rest is its plugin's contract, read through `#generated/fe` and `#generated/events` | yes |
| `repository-casts` | `repository as unknown as …`, reading a repository through a type its owner never declared. `repository` from `#generated/repository` is already typed with your own repositories and your dependencies' | yes |
| `reserved-event-keys` | a property named `_call`, in `src` or `tests`. That key is the app's: a delivery door writes the call a message answers under it, so a field of yours by that name is overwritten on the way in and read as a correlation on the way out. Ask `answersCall(event, outstanding)` or `settleCall(pending, event)` from `@abuddy/sdk/events` instead of reading it, build an answer in a test with `answerTo` from `@abuddy/sdk/testing`, and rename a field of your own that collides | no |

A rule marked switchable has no effect at run time, so a pack may switch it off in **`abuddy.checks.json`**
at its root:

```json
{ "allow": ["backend-console", "untyped-sends"] }
```

The others report something that breaks — a specifier nothing resolves, an import the bundler refuses, a name
the next app version may rename — so there is nothing to allow, and naming one in `allow` is an error.

Exits with code 1 on errors.

#### `abuddy doctor`

Health checks with pass/warn/fail output:
- `abuddy.json` exists and parses
- `id` and `hostVersion` are set
- `src/__generated__/` exists (warn)
- Each feature's `system.entry` and `plugin.entry` exist
- Each `steps.definitions[].path` exists

#### `abuddy facade-report [--update]`

Reports your pack's **facade types** — what packs depending on yours compile against, the same bundle
`abuddy build` writes to `dist/types/pack-types.d.ts` — as a reviewed file at `etc/pack-types.api.md`.

**It needs no build.** It regenerates `src/__generated__/` and bundles the facade itself, so the report is
held against the facade your sources describe now; a `dist` left by an older build is never its subject.
Without `--update` it fails, printing a diff, when the committed report differs; with `--update` it rewrites
the report. Commit the result: the point is that a change to what dependents can see is visible in review
rather than buried in a generated bundle.

`abuddy build` warns when your committed report has fallen behind the bundle it just produced. The command
above is what fails, which is why a pack's own CI runs it.

The report is normalised so it moves only when the facade does — imports first and sorted, declarations in
name order, literal unions sorted, and the pack's own path shortened to `.`. That last normalisation matters
for a reason worth knowing: TypeScript prints an inferred union's members in the order it created the member
types, and that order varies between builds, so an unnormalised report would differ from itself.

#### `abuddy info`

Print a summary of the current pack: id, version, host version, feature count, step count, pack service count, action/prompt/flow content file counts, dependency count, whether `dist/` exists, and the pack root.

### Testing

#### `abuddy init-tests`

Scaffold Playwright E2E tests in the pack root: `playwright.config.ts` (tests in `tests/e2e`), `tests/e2e/smoke.spec.ts` (using the first feature with a plugin), `.gitignore` entries for `tests/screenshots/` and `tests/results/`, and `@abuddy/testing` and `@playwright/test` devDependencies. Existing files are kept.

#### `abuddy test [--build <name|path>] [--prebuilt] [playwright args...]`

Run the pack's Playwright tests in AgentBuddy. Other arguments go to `playwright test`. The app is, in order:

1. `--build <path>`: a local AgentBuddy checkout (installed and built)
2. `--build beta` or `ABUDDY_BUILD=beta`: an AgentBuddy Beta build satisfying the pack's `hostVersion`
3. `ABUDDY_ROOT`
4. A Beta build satisfying the pack's `hostVersion`, as `--build beta` would

A Beta build is **downloaded once and then reused**: whenever one you already have satisfies the pack's
`hostVersion`, that one runs — so this works offline and asks GitHub nothing. The newest is fetched only when
none of them fits. `abuddy clean --apps` lists what has been downloaded, with sizes, and removes all but the
newest; `--all` removes that one too, which is how you move to a newer Beta.

**`abuddy test` never reads the app you saved and never asks**, so a test run means the same thing on a fresh machine as on one you have been developing on. Holding that preference is `abuddy dev`'s job. The fixture builds the pack with the same CLI and installs it into a fresh data dir for each worker, so a run leaves nothing behind either.

`--prebuilt` installs the build already in `dist/` instead of making a new one, for a pipeline that built the
pack in an earlier step. The build is still held to being no older than the pack's sources and `abuddy.json`,
naming the file that moved if it is not — so a stale build fails rather than being tested quietly, which is
what the rebuild was there for. Reach for it when something else owns the build: a rebuild empties `dist`
before its first phase and does not refill it until the last, so a second build of the same pack, or anything
reading that directory meanwhile, sees a pack that is not built.

### Distribution

#### `abuddy release [patch|minor|major] [--beta] [--dry-run] [--local] [--skip-tests] [--skip-e2e]`

Cut a release (default `patch`):

1. Preflight: valid manifest with `hostVersion`, dependencies resolve, a clean git tree on the default branch, not behind `origin`, and the tag not already on `origin`
2. Bump `abuddy.json` and `package.json`. `--beta` follows the app's cycle: `1.2.3` → `1.2.4-beta.0` → `1.2.4-beta.1` → `1.2.4`
3. `abuddy build --release`, `tsc --noEmit`, the `test` script (skip with `--skip-tests`), and `abuddy test` when `playwright.config.ts` exists (skip with `--skip-e2e`)
4. Commit, pack into `.abuddy/release/`, tag `v<version>` and push

The scaffolded `.github/workflows/release.yml` publishes the GitHub release from the tag. `--local` publishes from this machine instead; it needs `GITHUB_TOKEN` or `GH_TOKEN` and refuses when the workflow exists. `--dry-run` edits no files, runs no git operations and publishes nothing: it builds and verifies the next version's pack under `.abuddy/release/`.

#### `abuddy release publish [--dir <dir>] [--dry-run]`

Verify the pack in `<dir>` (default `.abuddy/release`) and create the GitHub release `v<version>` (a prerelease for prerelease versions), uploading `<id>-<version>.tgz`, `.sha256` and `.integrity.json`. The release workflow runs it. Needs `GITHUB_TOKEN` (or `GH_TOKEN`), and `GITHUB_REPOSITORY` or a GitHub `origin` remote.

#### `abuddy install <source> [-d|--dev] [-b|--beta]`

Install a pack into the app's data dir (`<userDataDir>/packs/<id>`). `<source>` is one of:

| Source | Example |
|---|---|
| Local directory (a built pack source or a pack layout) | `../my-pack` |
| Local archive (`.tgz`, `.tar.gz`, `.zip`) | `./my-pack-0.1.0.tgz` |
| URL to a `.tgz`, `.tar.gz` or `.zip` | `https://example.com/my-pack-0.1.0.tgz` |
| GitHub release: `owner/repo`, or `owner/repo@tag` (default: latest) | `user/my-pack@v0.1.0` |

```bash
abuddy install ./my-pack-0.1.0.tgz
abuddy install ../my-pack
abuddy install user/my-pack
```

A GitHub release needs a `.tgz` asset and the `.sha256` asset published beside it (`abuddy release` writes both); a release without one is refused, since nothing would say the download is that release. A URL install is unverified, and says so. The pack is verified before it's placed, and `hostVersion` is checked against the version the app recorded in that data dir. A source directory must be built: one with neither a `integrity.json` nor a `dist/runtime/index.cjs` beside `dist/types/snapshot.json` is refused, with a note to run `abuddy build` first. Restart the app after installing.

#### `abuddy uninstall <id> [-d|--dev] [-b|--beta]`

Remove an installed pack by ID. Restart the app after uninstalling.

#### `abuddy list [-d|--dev] [-b|--beta]`

Show installed packs.

`install`, `uninstall` and `list` read the production build's data by default. `--build <name>` says which — `production`, `beta`, `development` or `test` — and `-d`, `-b` and `--production` are shorthands for the first three. They name a **build**, never a profile: a build keeps its own default storage, and `--profile` is the one override.

### App

#### `abuddy open [-b]`

Open the installed AgentBuddy app, or bring it to the front if it's running. Pass `-b` for AgentBuddy Beta. macOS only.

#### `abuddy upgrade [-b] [--relaunch] [--force]`

Install the newest published AgentBuddy into `/Applications`, replacing what is there. `-b` upgrades
AgentBuddy Beta from the newest prerelease instead; the two channels never see each other's releases, so a
beta never arrives as a production upgrade. macOS on Apple Silicon only, which is where the app is published.

It takes the release's `.zip` and checks it against the `.sha256` published beside it, then expands it with
`ditto` — which keeps the bundle's symlinks, permissions and code signature. Nothing is installed until that
check passes, and the app already in `/Applications` is moved aside rather than deleted, so a failed install
puts it back.

It asks the running app to quit and waits for it to say it has, by the `app.lock` the app removes on
shutdown; a copy that will not quit stops the upgrade rather than being killed, because replacing a bundle
under a live process is the thing being avoided. Nothing here needs a GitHub token — the releases are public
— though `GITHUB_TOKEN`/`GH_TOKEN` is used for the higher API rate limit if one is set.

Already-current is reported rather than reinstalled; `--force` installs anyway, and `--relaunch` opens the
app afterwards.

### Database

`abuddy db` reads and changes the app's database (EARS on LMDB) from the command line: to look at data, repair it when the app can't start, or move it between machines.

```bash
abuddy db query "return qx(EARS.Entity.Note).count()"
abuddy db inspect Flow-123 --depth 2
abuddy db export --out ./export
abuddy db import ./agentbuddy-backup-2026-09-17 --production --force
abuddy db reset --production        # lists what it would delete
```

**Which data.** `--build <name>` says which build's data dir — `-d`, `-b` and `--production` are its shorthands — `--data-dir <path>` any data dir, such as a copy of the user's, and `--profile <name>` a profile `abuddy dev` made, by the name it printed. Name one of them, not two. `--schema-from <path>` names a pack snapshot for a data dir that publishes none of its own. Without it such a dir still opens to **read**, and the command says which entity types it could not name; a command that **changes** it is refused, because an incomplete schema makes a write land on the wrong rows. A command that only reads takes the production app's data without being told, and a dry run of `import`, `reset` or `clear-settings` counts as reading; **a change (`exec`, `repl --write`, and those three with `--force`) names its data dir**, so the user's own data is never what a forgotten flag hits. Each command prints the data dir it opens (on stderr, so results on stdout stay clean). A flag means that app's own data dir, whatever `ABUDDY_USER_DATA_DIR` is set to in the shell; the variable applies only when nothing names a data dir.

**While the app runs.** The commands open the database files themselves (offline); the app keeps the whole database in memory and is its only writer. So a change (`exec`, `repl --write`, and `import`, `reset` or `clear-settings` with `--force`) refuses while an AgentBuddy app runs on the data dir: the API it published is running, or (on macOS and Linux) its single-instance lock is held by a live process. Files left behind by a crash name processes that have exited, so they don't stand in the way. Quit the app first. Reading commands work, with a warning that they miss what the app hasn't written yet, and so do the dry runs: they open the database without writing to it, so they also work against a copy you have no permission to change.

While a command changes the database it holds a lock on the data dir (`db-write.lock`), so a second `abuddy db` is refused and an AgentBuddy started meanwhile refuses to open that database instead of overwriting the change. A lock left behind by a command that was killed is ignored once its process is gone.

**The run history.** The database has two partitions: the app's data, and the run history (`TNode` rows, what each flow step did). Commands read the data only, as the app does, so a query for `TNode` comes back empty until you pass `--volatile`, which reads both. `reset` deletes both either way; its listing counts the run history only with `--volatile`.

**Writing.** There is no apply command: AgentBuddy content each pack's data when it starts (and `abuddy dev` re-applies a pack it rebuilds), so start the app rather than content a data dir by hand.

**Installed packs.** Entity types, relation kinds and where each type is stored come from the packs installed in the data dir — every enabled pack in `packs/`, the ones the app ships included, read from its own `abuddy.json`; no pack code runs. A data dir with no packs installed knows only the names the app itself declares, which is the truth about it rather than a degraded reading of it.

#### `abuddy db query <code> | --file <path> [-o pretty|json|csv] [--out <file>]`

Run query code with the Database console's read helpers: `qx`, `EARS`, `getAttr`, `getAttrs`, `getAll`, `getRoles`, `getAllEntities`, `getEntitiesOfType`, `findRelations`, `getRelationStats`, `getSchemaStats`, `queryEntitiesByAttribute`, `queryEntitiesByRelationTo`, `queryEntitiesInRelationTo`. The code is a function body, as in the console: `return` the result. `EARS.Entity` holds the installed packs' entity types. It runs as a plain function, so it can't use top-level `await`, `import` or `require` — a script (`abuddy db script`) can.

```bash
abuddy db query "return qx(EARS.Entity.Settings).pickAll()" -o json --out settings.json
abuddy db query --file ./report.js -o csv
```

#### `abuddy db exec <code> | --file <path> [-o pretty|json|csv] [--out <file>]` (names its data dir)

Run transaction code with the console's read and write helpers (`tx`, `destroyEntity`, `prepareEntity`, `createEntityWithDefaults`, `updateEntity`, `createRelation`, `removeRelation`, `removeRelationById`, `grantRole`, `revokeRole`). Despite the name, the code is not one transaction: each helper writes as the code runs, so code that throws part way leaves the writes it already made — the failure says so, and there is nothing to roll back. A write that fails to reach the files fails the command.

```bash
abuddy db exec "tx('Note-123').put('title', 'Renamed')"
```

#### `abuddy db repl [--write]` (`--write` names its data dir)

Run console code a line at a time and print each result: query code, or with `--write` transaction code, whose changes are written on exit. `.exit` or Ctrl+D quits.

#### `abuddy db script <file> [--read-only] [-o pretty|json|csv] [--out <file>] [-- <script arguments>]` (names its data dir)

Run a script file against the database, for work a one-liner can't do: it imports what it likes and brings its own helpers. JavaScript (`.mjs`, `.js`, `.cjs`) runs as it is; TypeScript is compiled first, to a temp file rather than your own directory, with its relative imports compiled in and its packages resolved from where the script lives, so `import.meta` and every import still point where you'd expect. The file default-exports a function, which is called with the open database and whose result is printed like a query's.

```ts
// notes-report.ts
export default async ({ db, EARS, args, log }) => {
  const notes = db.query.getEntitiesOfType(EARS.Entity.Note);
  log(`${notes.length} notes`);
  return notes.map((id) => db.query.getAll(id));
};
```

```bash
abuddy db script ./notes-report.ts --production -o json --out notes.json
abuddy db script ./cleanup.ts -d -- --older-than 30
```

| It receives | |
|---|---|
| `db` | the open database: `query` (`qx`, `tx`, the finders), `admin`, `store`, `schema`, `paths`, `userDataDir` |
| `EARS` | the entity types and relation kinds of the packs installed in that data dir |
| `args` | whatever follows `--` |
| `log` | prints a line, like the script's own output |

The database is handed to the script rather than left for it to open: the published CLI carries its own copy of the engine, so a script importing `@abuddy/ears` itself would get a second one, with no data in it. `--read-only` opens the database without writing, so a reporting script can run while AgentBuddy is open.

#### `abuddy db inspect [<entity-id> | --type <Entity>] [--depth <n>] [--incoming] [--outgoing]`

Print an entity, its roles and its relations grouped by kind, following them `--depth` levels (default 1); `--incoming` or `--outgoing` shows one direction. `--type` prints the first five entities of a type. With neither, it prints entities and relations per entity type.

#### `abuddy db export --out <dir> [--type <Entity>...] [--format json|csv]`

Write each entity type's entities, with every attribute, to `<dir>/<Entity>.json` (or `.csv`), and a summary (when it ran, the data dir, the format and the counts) to `<dir>/export.json`. Without `--type`, every type with entities. Roles are in each entity's `role` attribute, and relations are the `Relation` entities (their `relationDetails`).

#### `abuddy db import <backup-dir> [--force] [--skip-unknown]` (names its data dir)

Replace the database, and the media folder when the backup has one, with a backup made in the Database settings' Backup & Restore. The backup is checked first: it has `metadata.json`, lists the app's main database, that folder is there, and every database it would put in place opens in a storage format this version reads — so a backup this AgentBuddy can't read is refused before any of your data is replaced. A backup made by a newer AgentBuddy may also hold stores this one doesn't have; importing it would replace your data with an incomplete copy, so it's refused unless you pass `--skip-unknown`, which imports it without them. If the backup lists a store it holds nothing for, the listing says so and that store comes back empty. Without `--force` it lists the backup, its contents and what it would replace, and changes nothing. The app migrates the data on its next start if the backup is from an earlier version.

#### `abuddy db reset [--force] [--keep-keys]` (names its data dir)

Delete all of the app's data, as Reset Database in the Database settings does: both database partitions (the data and the run history) and the stored secrets. The app creates its default data (settings, written flows, the packs' content) on its next start and shows onboarding. Without `--force` it lists the entities per type and each stored secret it would delete.

No backup holds the secrets — `export` and the Database settings' backups copy the databases and the media folder, never the secrets or the data key that encrypts them — so a deleted secret is entered again in Settings → Secrets. That's why the listing names each one by provider and label (never its value), and why `--keep-keys` leaves them where they are and deletes only the data.

#### `abuddy db clear-settings [--force]` (names its data dir)

Destroy every Settings row (the user's changes to the default settings); the app recreates the defaults on its next start. Without `--force` it lists each row and the settings it stores.

In the AgentBuddy repo, `npm run db:query`, `db:exec`, `db:repl`, `db:inspect`, `db:export`, `db:import`, `db:reset` and `db:clear-settings` run these commands on the development app's data (`-d`): `npm run db:query -- "return qx().count()"`.

### Cleanup

#### `abuddy profiles`

Every AgentBuddy data dir on this machine, and the verbs for the ones you made. Works outside a pack — a
data dir belongs to you rather than to any pack.

```
abuddy profiles                  what exists
abuddy profiles --sizes          with a size column
abuddy profiles --all            include the throwaway dirs `run --fresh --rm` makes
abuddy profiles new [name]       create one; a name is minted if you don't give one
abuddy profiles rename <a> <b>   rename one
abuddy profiles rm <name>...     remove the ones you name
abuddy profiles rm --leaked      remove the ones a killed run left behind
```

Two kinds of directory, listed apart. An **environment** is where an app of that channel keeps its data —
production, beta, development, test — and nothing here removes one; a row says whether an app has it open,
what version last wrote to it, and `(no app data)` when the directory holds only a Chromium profile. A
**profile** is a data dir you can throw away.

Sizes are behind a flag because taking them means walking every directory: measured, 674ms for a 1.4GB
production dir and 1255ms for a 1.5GB development one. Names and paths come back immediately.

A profile an app is currently running on is never renamed or removed: taking a data dir away from a
running app does not stop it, it makes the app write the directory back.

#### `abuddy clean`

Remove build output: `dist/`, `.abuddy/`, `src/__generated__/`.

`--apps` lists the AgentBuddy Beta builds `--build beta` downloaded — a few hundred megabytes each, one per
release tested against — and removes all but the newest, which is the one a later run would reuse; `--all`
removes every build. It works outside a pack.

Data dirs are `abuddy profiles`, below: what exists, and removing the ones you own.
