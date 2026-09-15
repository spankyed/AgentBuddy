# Testing a pack

A pack has two kinds of tests:

- **Unit tests** (`npm test`, vitest) run your pack's code without the app, through `@abuddy/testing/harness`: seeds and repositories, systems, services and flows, with your dependencies' behaviour.
- **E2E tests** (`abuddy test`, Playwright) run your pack in AgentBuddy, UI included. See the `@abuddy/testing` fixture (`abuddy init-tests`).

This page covers unit tests.

## Setup

`abuddy init` scaffolds `vitest.config.ts` and `tests/setup.ts`:

```typescript
// tests/setup.ts
import '#generated/seeders';
import { seedRuntime } from '#generated/seed-runtime';
import { registration } from '#generated/pack-entry';
import { setupPackTests } from '@abuddy/testing/harness';

await setupPackTests({ seedRuntime, registration });
```

- **What's registered:** your entity types, repositories, seed hooks and seeders, and, with `registration`, your systems, services, steps and feature settings. Each dependency's full backend runtime (its systems, services and steps, on your pack's `@abuddy/sdk`) is registered too.
- **Without `registration`**, only data code runs: each dependency contributes its seed runtime (entity types, repositories, seed hooks). These tests start faster and never load a dependency's runtime.
- **Run `abuddy build` once first**, so dependencies are fetched into `.abuddy/deps/`.
- **Each test starts from an empty database.** Apps a test starts stop after it; service mocks last one test.
- **A system error the test didn't expect fails it.** Take expected ones with `takeSystemErrors()`.

## Seeds

```typescript
import { seedPack } from '@abuddy/testing/harness';
import { findAll } from '#generated/ears';

it('seeds notes', async () => {
  expect(await seedPack({ keys: ['team-notes'] })).toEqual({ 'team-notes': { created: 1, updated: 0, skipped: 0 } });
  expect(findAll('Note')[0].shortCode).toMatch(/^NOTE-/);
});
```

`seedPack({ keys?, mode? })` compiles your seed entries (your formats and your dependencies') and seeds them. Without `keys` it seeds every entry naming a format. Name `actions`, `prompts` and `flows` to seed those, before running flows.

## Systems

`startApp` runs registered systems under the same bus the app uses, and plays the client:

```typescript
import { seedPack, startApp } from '@abuddy/testing/harness';
import { repository } from '#generated/repository';

it('stores a memo a client adds and sends it back', async () => {
  const app = await startApp({ systems: ['memos'] });
  await app.connect();                                             // CLIENT_CONNECTED, as a client connecting
  expect(await app.nextEmit('memos', 'MEMOS_CONNECTED')).toMatchObject({ memos: [] });

  await app.send('memos', { type: 'ADD_MEMO', text: 'hello' });   // as trpc.bus.send
  expect(await app.nextEmit('memos', 'MEMO_ADDED')).toMatchObject({ memo: { text: 'hello' } });
  expect(repository.memoQueries.all()).toHaveLength(1);
});
```

| Member | What it does |
|---|---|
| `startApp({ systems })` | Starts the named systems (your feature ids, or a dependency's, e.g. `settings`), in registration order; `'*'` starts all |
| `connect()` | Sends `CLIENT_CONNECTED`; the bus routes client events only once connected |
| `send(systemId, event)` | Sends a system an event |
| `emitted(pluginId?)` | Events sent to frontend plugins (`emit` and `sendToPlugin`) |
| `nextEmit(pluginId, type)` | The next such event no earlier call returned, waiting for it |
| `settle()` | Resolves once the systems have no work left |
| `system(systemId)` | A running system's actor |

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

`runFlow` runs a flow on the brain. Your pack or a dependency (default-setup) must provide the brain and settings systems:

```typescript
import { mockInference, seedPack, startApp } from '@abuddy/testing/harness';

it('summarizes a note', async () => {
  await seedPack({ keys: ['prompts', 'flows'] });
  mockInference('Buy milk');
  const app = await startApp({ systems: ['brain', 'settings'], rootFlow: 'Notes Summary' });

  const run = await app.runFlow('Notes Summary', { event: 'notes.summarize', data: { text: 'Remember to buy milk' } });

  expect(run.steps).toEqual([expect.objectContaining({ label: 'summarize', status: 'completed' })]);
  expect(run.steps[0].nodeAttributes.result).toMatchObject({ text: 'Buy milk' });
});
```

- **`runFlow(label, { event?, data?, timeoutMs? })`** makes the flow the root flow and starts the brain if it isn't running it. It triggers `event` (by default `flow.entry`, which starts the flow again) with `data` as its payload.
  - It resolves once every track the event triggered has finished: steps completed or failed, apart from steps that wait by design (keep-alive).
  - It returns the steps those tracks ran: `label`, `status`, `nodeAttributes` (with `result`) and `params` (the inputs resolved from the event).
- **`flowTrace(label)`** returns the steps a flow has run so far in the app, the root flow or a subflow, by the flow's label (not the label of the step that runs it).
- **The root flow:** the brain starts running the flow with the root role. Seeded flows without one (a pack's flows, whose root flow in the app is default-setup's) need `startApp({ …, rootFlow: label })`; otherwise the brain reports that no flow has the role. With no flows at all, the brain stops, and `runFlow` starts it.
- **Schedule triggers** register through the `scheduler` service. Mock it (`registerSchedule`, `unregisterByPrefix`, `clearAllSchedules`) and call the tick it receives to run the track.
