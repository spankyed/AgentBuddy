# Fix: Long-running commands block subsequent messages

## Context

When the agent runs a long-running command (e.g. `npm run start`), the stream consumer holds `isRunning: true` for the entire CLI session duration. Every subsequent user message hits the concurrency guard in `chat.ts` (line 119) and gets enqueued with `status: 'queued'` — stuck until the command terminates or times out (2 min default).

The Claude Code CLI already supports `run_in_background: true` on the Bash tool, which returns immediately with a `backgroundTaskId` while the process keeps running. `TaskOutput`/`TaskList` tools are already in our `DEFAULT_ALLOWED_TOOLS` list so the agent can check on background processes.

The fix combines two approaches: (1) nudge the agent via system prompt to use background mode for long-running commands, and (2) auto-release the turn as a safety net when a Bash tool blocks too long.

## Step 1 — System prompt nudge for `run_in_background`

**File:** `packages/default-setup/src/actions/claude-code/chat.ts` (line 222)

Add a standing instruction into `composedSystemPrompt`. Currently:

```ts
const composedSystemPrompt = [phaseHint, systemPrompt].filter(Boolean).join('\n\n') || undefined;
```

Change to include a `BG_COMMAND_HINT` constant:

```ts
const BG_COMMAND_HINT = `When running shell commands that are not expected to terminate quickly (dev servers, watchers, long builds, \`npm start\`, \`npm run dev\`, etc.), always set \`run_in_background: true\` on the Bash tool so the turn completes immediately. Use TaskOutput to check on the process afterward.`;

const composedSystemPrompt = [phaseHint, BG_COMMAND_HINT, systemPrompt].filter(Boolean).join('\n\n') || undefined;
```

## Step 2 — Auto-release via `tool_progress` detection

**File:** `packages/default-setup/src/actions/claude-code/_helpers/stream-consumer.ts`

### 2a. Add threshold constant (top of file)

```ts
/** Auto-release the turn if a Bash command runs longer than this (ms). */
const LONG_RUNNING_BASH_THRESHOLD_MS = 30_000;
```

### 2b. Inside `consumeStream`, add tracking state (after `userUuidTracked` declaration, \~line 98)

```ts
let autoReleased = false;
```

### 2c. Enhance the `tool_progress` handler (line 228)

Replace current handler:

```ts
if (line.type === 'tool_progress') {
  if (line.tool_use_id && typeof line.elapsed_time_seconds === 'number') {
    toolActivity.update(line.tool_use_id, {
      durationMs: Math.round(line.elapsed_time_seconds * 1000),
    });
  }
  continue;
}
```

With:

```ts
if (line.type === 'tool_progress') {
  if (line.tool_use_id && typeof line.elapsed_time_seconds === 'number') {
    toolActivity.update(line.tool_use_id, {
      durationMs: Math.round(line.elapsed_time_seconds * 1000),
    });

    // Auto-release: if a Bash command exceeds the threshold, kill the
    // CLI turn so the user isn't blocked. The spawned process survives
    // because child.kill() only targets the immediate CLI child.
    if (
      (line as any).tool_name === 'Bash' &&
      line.elapsed_time_seconds * 1000 >= LONG_RUNNING_BASH_THRESHOLD_MS
    ) {
      log.info('auto-releasing turn — long-running Bash command', {
        toolUseId: line.tool_use_id,
        elapsedSec: line.elapsed_time_seconds,
      });
      autoReleased = true;

      // Finalize writers before killing.
      writer.flush();
      const segmentHadErrors = toolActivity.entries.some(e => e.status === 'error');
      toolActivity.finalise(segmentHadErrors ? 'error' : 'done');
      writer.finalize(
        (writer.text ? writer.text + '\n\n' : '') +
        '⏳ Long-running command detected — turn released. The process continues in the background.'
      );
      services.chat.updateMessageState(currentMessageId as any, { forkable: true } as any);

      // Kill the CLI turn and release the thread lock.
      killTurn(services, threadId as string);

      break; // Exit the for-await loop — catch block handles cleanup.
    }
  }
  continue;
}
```

### 2d. Add import for `killTurn` (line 29)

Already imported: `import { getClaudeState, persistClaudeState, setRunning, dequeueMessage } from './thread-context';`

Add `killTurn`:

```ts
import { getClaudeState, persistClaudeState, setRunning, dequeueMessage, killTurn } from './thread-context';
```

### 2e. Handle auto-release in the post-loop finalization (after `break` exits the loop)

After the event loop (`for await`) ends, before the existing "Stream drained" finalization block (\~line 463), add:

```ts
// Auto-released: the turn was killed mid-stream. Writers are already
// finalized, killTurn() cleared the handle and set isRunning=false.
// Drain any queued message and emit cc.stream.completed, then return.
if (autoReleased) {
  const queued = dequeueMessage(services, threadId as string);
  if (queued) await replayQueuedMessage(services, threadId, queued, log);

  services.emitter.sendToBrainSystem({
    eventType: 'cc.stream.completed',
    payload: {
      threadId,
      sessionId: resultFromLine?.sessionId || getClaudeState(services, threadId as string)?.sessionId || '',
      costUsd: resultFromLine?.totalCostUsd ?? 0,
      durationMs: resultFromLine?.durationMs ?? 0,
      toolCallCount: toolActivity.entries.length,
      mutatedFileCount: mutatedPaths.length,
      mutatedPaths,
      hadErrors: false,
      userText: text,
      releasedEarly: true,
    },
  });
  return;
}
```

## Key files

| File | Change |
| --- | --- |
| `packages/default-setup/src/actions/claude-code/chat.ts` | Add `BG_COMMAND_HINT` to `composedSystemPrompt` |
| `packages/default-setup/src/actions/claude-code/_helpers/stream-consumer.ts` | Add `killTurn` import, threshold const, `autoReleased` flag, enhanced `tool_progress` handler, post-loop auto-release cleanup |

## Future work (not in this PR)

- **bg-processes artifact** — surface running background tasks in the canvas for visibility
- **Kairos-style auto-backgrounding** — would require enabling the CLI's internal `KAIROS` feature flag

## Verification

1. `npm start` to launch dev mode
2. In a Claude Code thread, ask the agent to run a long-running command (e.g. `npm run start`)
3. **Primary path**: agent should use `run_in_background: true` (system prompt nudge) — turn completes normally
4. **Safety net**: if agent runs foreground, turn auto-releases after \~30s with "⏳ Long-running command" message
5. Send a follow-up message — should process immediately (not queued)
6. Background process should still be running (verify via `TaskOutput` tool or `ps`)

&nbsp;