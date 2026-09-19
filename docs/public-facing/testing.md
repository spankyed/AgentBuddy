# Testing a pack

A pack has two kinds of tests:

- **Unit tests** (`npm test`, vitest) run your pack's code without the app, through `@abuddy/testing/harness`: seeds and repositories, systems, services and flows, with your dependencies' behaviour.
- **E2E tests** (`abuddy test`, Playwright) run your pack in AgentBuddy, UI included. See the `@abuddy/testing` fixture (`abuddy init-tests`).

This page covers unit tests.

## Setup

`abuddy init` scaffolds `vitest.config.ts` and `tests/setup.ts`:

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import { isolatedDataDir } from '@abuddy/testing/vitest';

// A throwaway data dir per run, one subdir per worker
const dataDir = isolatedDataDir();

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/unit/**/*.spec.ts'],
    env: dataDir.env,                                          // ABUDDY_ENV=test, ABUDDY_USER_DATA_DIR=<run dir>
    globalSetup: dataDir.globalSetup,                          // passes the project root to the harness; removes the run dir at the end
    setupFiles: [...dataDir.setupFiles, './tests/setup.ts'],   // the worker setup first: each worker uses <run dir>/worker-<n>
  },
});
```

- **Set no `resolve.conditions`.** A pack's tests resolve its `@abuddy` packages exactly as `abuddy build` does: to the `dist` each published package ships. That is the one layout a pack ever has, so there is nothing to select.
- **`isolatedDataDir(prefix?)`** creates the run's data dir. `setupPackTests` fails when `ABUDDY_USER_DATA_DIR` is unset, so keep its `env`, `globalSetup` and `setupFiles`, with its setup files before yours.
- **Keep vitest's `isolate` on** (the default). The harness keeps one registry, database and set of mocks per test file, and `setupPackTests` fails, saying so, when it runs a second time in one process (`isolate: false`).

```typescript
// tests/setup.ts
import { seedRuntime } from '#generated/seed-runtime';
import { registration } from '#generated/pack-entry';
import { setupPackTests } from '@abuddy/testing/harness';

await setupPackTests({ seedRuntime, registration });
```

- **What's registered:** your entity types, repositories, seed hooks and seeders, and, with `registration`, your systems, services, steps and feature settings. Each dependency's full backend runtime (its systems, services and steps, on your pack's `@abuddy/sdk`) is registered too.
- **Without `registration`**, only data code runs: each dependency contributes its seed runtime (entity types, repositories, seed hooks). Pass your seeders (`import { seeders } from '#generated/seeders'`, `setupPackTests({ seedRuntime, seeders })`) for `seedPack`; a registration carries its own. These tests start faster and never load a dependency's runtime.
- **The registered packs are the test file's own:** the harness registers your pack and its dependencies in a registry it creates for the file, which the SDK's lookups (`getDesignated`, `stepRegistry`, `getPackCommands`, `services`, …) read. To test how your pack reacts to another pack (its commands, feature settings or seeders), register one with `registerPack({ id, systems: [], … })` from `@abuddy/testing/harness`, and `unregisterPack(id)` when done.
- **A lookup filled directly:** for what no pack registers (a step type or designation only one test needs), fill `testPacks` from `@abuddy/sdk/testing` (`steps`, `designations`, `artifacts`, `blocks`, `services`, `seedHooks`, `seeders`, `commands`); its entries are found before the registered packs'. Empty it with `testPacks.clear()`.
- **Run `abuddy build` once first**, so dependencies are fetched into `.abuddy/deps/`.
- **The pack is found** at or above the vitest project's root (`--root`, `test.root`, a workspace project's directory), which `isolatedDataDir()`'s `globalSetup` passes to the harness; pass `packDir` to `setupPackTests` to name it yourself.
- **Each test starts from an empty database** (a fresh EARS engine, with your repositories registered; no secrets or media). Apps a test starts stop after it; service mocks last one test. `resetTestData()` does the same mid-test: a fresh engine, the secrets emptied and the media store cleared; registrations stay. `testMediaPath(entityId?)` names the media store (or one row's folder in it) for a test that asserts on seeded media.
- **The engine is the harness's.** Everything your code reaches through `#generated/ears`, `#generated/repository` and `@abuddy/ears` acts on the engine the harness installed. Code tested without the harness (a helper over the engine) can create and install its own with `createEarsEngine`/`installEngine` from `@abuddy/ears` ([Engine instances](services-and-data.md#engine-instances)); don't do that in a harness test file, which would replace the harness's engine. Install `@abuddy/ears` at the version your `@abuddy/sdk` uses: when they differ, npm gives the SDK its own copy, and `setupPackTests` fails naming both.
- **Tests in a file run one at a time.** The database, service mocks and apps are shared by a file's tests, so a test that runs alongside another (`it.concurrent`, `describe.concurrent` or `sequence.concurrent` next to another concurrent test) fails. Spec files still run in parallel, each in its own worker.
- **A system error the test didn't expect fails it.** Take expected ones with `takeSystemErrors()` from `@abuddy/testing/harness`: it returns the `SYSTEM_ERROR` events systems reported with `reportError` (without `step`) since the last call (`message`, `source`, `stack`, …), and clears them. Logs from `createLogger` print to the console and reach `onLog` subscribers, as in the app.
- **A pack scaffolded before the harness** (no `tests/setup.ts`) gets it from `abuddy add feature`, with the system test it scaffolds. A vitest config the pack has (`vitest.config.*` or `vite.config.*`) is kept: add the harness setup to it as the command prints. `@abuddy/testing` is added at your `@abuddy/sdk` range (they're released together); when your `@abuddy/testing` has no harness or your vitest is older than 3, the command prints the `npm install` that upgrades them.

## Seeds

```typescript
import { seedPack } from '@abuddy/testing/harness';
import { findAll } from '#generated/ears';

it('seeds notes', async () => {
  expect(await seedPack({ keys: ['team-notes'] })).toEqual({ 'team-notes': { created: 1, updated: 0, skipped: 0 } });
  expect(findAll('Note')[0].shortCode).toMatch(/^NOTE-/);
});
```

`seedPack({ keys?, mode? })` compiles your seed entries (your formats and your dependencies') and seeds them. Without `keys` it seeds every entry naming a format and no `seeder`. Name `actions`, `prompts` and `flows` to seed those, before running flows.

## Systems

`startApp` runs registered systems under the same bus the app uses, and plays the client:

```typescript
import { seedPack, startApp } from '@abuddy/testing/harness';
import { repository } from '#generated/repository';

it('stores a memo a client adds and sends it back', async () => {
  const app = await startApp({ systems: ['memos'] });
  await app.connect();                                             // CLIENT_CONNECTED, as a client connecting
  expect(await app.nextEmit('memos', 'MEMOS_CONNECTED')).toMatchObject({ memos: [] });

  await app.send('memos', { type: 'ADD_MEMO', text: 'hello' });   // as a client's sendToSystem does
  expect(await app.nextEmit('memos', 'MEMO_ADDED')).toMatchObject({ memo: { text: 'hello' } });
  expect(repository.memoQueries.all()).toHaveLength(1);
});
```

| Member | What it does |
|---|---|
| `startApp({ systems })` | Starts the named systems in registration order; `'*'` starts all. A bare id is tried as given, then as your pack's `<packId>.<featureId>`: use your feature ids, a built-in dependency's feature ids (default-setup's `settings`), or an external dependency's full bus id (`<depId>.<featureId>`) |
| `connect()` | Sends `CLIENT_CONNECTED`, which reaches every running app, as a client connecting does. Every running system gets it (the harness has no client that loads pack frontends later), and sends to frontend plugins are delivered from then on. Events for systems don't wait for it: client events, and the events systems, steps and schedules send (`sendToSystem`, `fire`, schedule ticks), reach them from `startApp`, as in the app |
| `send(systemId, event)` | Sends a system an event, connected or not |
| `emitted(pluginId?)` | Events sent to frontend plugins (`emit` and `sendToPlugin`). Both go through the bus, as in the app, so one sent before `connect()` is dropped and never appears here (systems send their startup data once a client connects, so `connect()` first) |
| `nextEmit(pluginId, type, { timeoutMs? })` | The next such event no earlier call returned, waiting for it (default 5000 ms) |
| `settle()` | Resolves once the systems have no work left |
| `system(systemId)` | A running system's actor |
| `stop()` | Stops the systems; pending and later `connect`, `send`, `nextEmit`, `settle` and `runFlow` calls fail with "The test app stopped", and so does `system`. `emitted` still reads what was sent. Once no app runs, each registered pack's `boot.onShutdown` runs, as when the app stops a pack, so what pack modules keep outside their systems (default-setup's cron jobs and brain listeners) doesn't reach the next test. The harness stops apps after each test |

**Boot hooks run around a test's apps.** The first app a test starts runs each registered pack's `boot.onInit` (your dependencies' first) before its systems start, as the app does at boot, and the last one to stop runs `boot.onShutdown`. A pack that opens something in `onInit` and closes it in `onShutdown` gets that pair for every test that starts an app.

`abuddy add feature` scaffolds a system test like this for each feature.

## Services

`services` (from `#generated/services`) holds your services and your dependencies'. `mockService` replaces one for the current test:

```typescript
import { mockService } from '@abuddy/testing/harness';
import { services, type Services } from '#generated/services';

it('digests a note, with only the inference call it makes mocked', async () => {
  mockService<Services, 'inference'>('inference', { generateText: async () => ({ output: { summary: 'Buy milk' } }) } as never);
  expect(await services.digest.digest('Remember to buy milk')).toEqual({ summary: 'Buy milk' });
});
```

Give only the members the code under test uses. A mock lasts for the test it's made in: make it in the test or a `beforeEach` (`mockService` fails in `beforeAll` or at the top of a file). Code that imports a service module directly, instead of using `services`, isn't affected. Mock services that reach outside the process (CLIs, the network) in any test that runs code using them.

`services.secrets` works in unit tests, in memory and emptied before each test: store a key's metadata as Settings → Secrets would with `addTestSecret(provider, label)` from `@abuddy/testing/harness` (the first key for a provider is selected). Keys have no values in tests.

## Models

Unit tests never reach a provider: `services.inference` (and so the `llm` step) fails until the test mocks it. `mockInference` does that for one test with a fake that runs the AI SDK's real calls on a scripted model (`fakeInference` from `@abuddy/sdk/testing`; `ai` comes with `@abuddy/sdk` as a peer dependency):

```typescript
import { mockInference } from '@abuddy/testing/harness';

const inference = mockInference('A short summary');          // or (call) => reply, per language model call
// … run code that calls services.inference …
expect(inference.calls[0]).toMatchObject({ kind: 'text', model: 'anthropic:claude-sonnet-4-5', messages: [{ role: 'user', text: 'Summarize this note: …' }] });

// Other kinds of model answer from the second argument; each has a default
mockInference('unused', { embedding: (value) => [value.length, 0], image: pngBytes, speech: mp3Bytes, transcript: 'Buy milk', relevance: (query, document) => String(document).includes(query) ? 1 : 0 });
```

- **A reply** is text, or `{ text?, toolCalls?: [{ toolName, input }] }`. Tool calls run your tools' `execute`, and the AI SDK calls the model again while `stopWhen` allows, so a function reply can answer tool results with text.
- **Structured output:** reply with JSON; `output` (a spec like `{ type: 'object', schema }` or an `Output`) parses it as it would a real model's reply, and rejects what the schema rejects.
- **Agents** (`createAgent`) run on the same language model: each step is a call, answered by `reply`.
- **Other kinds:** `embedding` (each value's vector, default `[value.length, 1, 0]`), `image` (default a 1×1 PNG), `speech` (default a silent MP3 frame), `transcript` (default `'Fake transcript'`) and `relevance` (each document's score for a `rerank` query, from 0 to 1; by default earlier documents rank higher).
- **`calls`** records each model call in order, with its `kind`. Like a real provider's, a call can take several model calls: one per step for text, chunks of 2048 values for `embedMany`, batches of up to 10 images for `generateImage`.
  - `text`: `model`, `instructions`, `messages` (each message's text; tool calls and results as JSON), `tools` and `stream`;
  - `embedding`: `model`, `values`; `image`: `model`, `prompt`, `n` (this batch's), `size`, `aspectRatio`;
  - `speech`: `model`, `text`, `voice`, `instructions`, `speed`; `transcription`: `model`, `mediaType`;
  - `reranking`: `model`, `query`, `documents`, `topN`.

## Flows

Flows run in unit tests as they do in the app. The brain runs the root flow, the one flow marked `root: true`, when the app starts, and every other flow runs as a subflow something spawned: default-setup's `Root Flow` spawns its long-running work modes, each kept alive by `entry([keepAlive()])`. An event reaches every running flow. Your pack or a dependency (default-setup) must provide the brain and settings systems:

```typescript
import { importFlows, mockInference, seedPack, startApp } from '@abuddy/testing/harness';
import { entry, keepAlive, subflow } from '#generated/flow-helpers';

it('summarizes a note', async () => {
  await seedPack({ keys: ['prompts', 'flows'] });
  // The app's root flow is default-setup's: host your flow the way it hosts long-running flows
  importFlows({ 'Root Flow': { root: true, tracks: [entry([subflow('Notes Summary')], [keepAlive()])] } });
  mockInference('Buy milk');
  const app = await startApp({ systems: ['brain', 'settings'] });

  const run = await app.runFlow('Notes Summary', { event: 'notes.summarize', data: { text: 'Remember to buy milk' } });

  expect(run.steps).toEqual([expect.objectContaining({ label: 'summarize', status: 'completed' })]);
  expect(run.steps[0].nodeAttributes.result).toMatchObject({ text: 'Buy milk' });
});
```

- **`importFlows(dsl)`** compiles flow DSL and imports it as the flow seeder does. Import before `startApp`: the brain starts the root flow when the app starts.
- **`runFlow(label, { event?, data?, timeoutMs? })`** (default timeout 10 000 ms, covering its sends and settling) sends `event` with `data` as its payload, as a client sends an event to the brain, and waits for the flow labelled `label`, which must be running (the root flow or a subflow).
  - It resolves once every track of that flow the event triggered has finished: steps completed or failed, apart from steps that wait by design (keep-alive).
  - Without `event`, it resolves with the entry tracks the flow ran when it started.
  - It returns a `FlowRun`: `eventTNodeIds`, the trace nodes of the tracks the event triggered, and `steps`, the steps those tracks ran in start order, each a `FlowStepTrace` (`tNodeId`, `label`, `tNodeType` (`step`, or `flow` for a subflow), `status`, `nodeAttributes` (with `result`) and `params` (the inputs resolved from the event and earlier steps)).
  - It never makes a flow the root flow or restarts the brain; it fails naming the running flows when `label` isn't one.
  - The result holds only the tracks `event` triggered. Tracks started by events those tracks send (a `fire` step, `sendToBrainSystem`) aren't in it: `await app.settle()`, then read them with `flowTrace`.
  - It doesn't connect the app: flows run, and events from `fire` steps and schedule ticks reach the brain, without a client. Connect only to read what systems send to plugins (`emitted`, `nextEmit`).
- **`flowTrace(label)`** returns the steps a flow has run so far in the app, the root flow or a subflow, by the flow's label (not the label of the step that runs it). It still reads after `stop()`: rows are kept as the brain last reported them.
- **Without a root flow** the brain doesn't start: it reports that no flow has the root role when flows exist, and stays stopped with no flows at all.
- **Schedule triggers** register through the `scheduler` service. Mock it (`registerSchedule`, `unregisterByPrefix`, `clearAllSchedules`) and call the tick it receives to run the track. Unmocked, real cron jobs run while the app runs and stop when it stops.

## Exports

`@abuddy/testing/harness`:

- **Setup and data:** `setupPackTests` (`PackTestOptions`), `seedPack` (`SeedPackOptions`), `importFlows`, `resetTestData`, `testMediaPath`, `SeedRuntime`, and `registerPack`/`unregisterPack` (another pack in the test file's registry).
- **Apps:** `startApp` and its types `StartAppOptions`, `TestApp`, `FlowRun`, `FlowStepTrace`, `RunFlowOptions` and `OutgoingSystemEvents` (what `emitted` and `nextEmit` return).
- **Mocks and host state:** `mockService`, `mockInference`, `addTestSecret`, `takeSystemErrors`.

`@abuddy/testing/vitest`: `isolatedDataDir` (`IsolatedDataDir`).

`@abuddy/sdk/testing`, for the two cases the harness doesn't cover:

- **`startFeTestRuntime(options?)` / `stopFeTestRuntime()`** — a frontend host for a test file that exercises plugin code, a tiptap plugin or a DSL type, which read the bound frontend the way a pack's backend reads the bound app. Bind it once per file and unbind at the end; nothing is registered unless the test passes it, so a contribution that registers itself on import is one this returns.

  ```typescript
  import { startFeTestRuntime } from '@abuddy/sdk/testing';

  const stopFeTestRuntime = startFeTestRuntime();
  afterAll(stopFeTestRuntime);
  ```

- **`registeredSeedKeys(packId)`** (`@abuddy/sdk/utils`) — the seed keys a registered pack has seeders for, which are the only keys an import of its seeds can seed. Assert against it when a test needs to know that a seeder is registered under the key its seed entry names, rather than inferring it from a `seedPack` count.
