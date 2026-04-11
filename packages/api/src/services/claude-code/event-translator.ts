/**
 * Event translator — pure stateless mapper from one parsed Claude Code
 * stream-json event → zero-or-more `Effect` objects.
 *
 * The action layer owns the side effects (chat/artifact/emitter). This module
 * is intentionally pure so it can be unit-tested without XState or any
 * running subprocess.
 *
 * The Claude Code stream-json protocol evolves; fields are parsed
 * defensively and unknown events are ignored (returned as `[]`).
 *
 * The exact stream-json event shapes are derived from the public
 * `claude --print --output-format stream-json --verbose --include-partial-messages`
 * output. Known top-level `type` values we care about:
 *
 *   - 'system'      — includes `subtype: 'init'` carrying `session_id`
 *   - 'stream_event'— wraps partial Anthropic SDK message deltas
 *   - 'assistant'   — full assistant message (end of a tool/text span)
 *   - 'user'        — replay of user message or a tool_result
 *   - 'result'      — terminal event with `usage`, `total_cost_usd`
 *
 * Any other `type` is treated as a no-op. We do not throw on unknown shape —
 * the CLI is the source of truth and may emit new fields over time.
 */

export interface TranslatorContext {
  /** The placeholder assistant message we created before spawning the turn. */
  placeholderMessageId: string;
  /** Thread the assistant message belongs to. */
  threadId: string;
  /**
   * Set of tool_use block ids we have already surfaced as `add_block` effects.
   * Used to decide between `add_block` and `patch_block` for `tool_result`s.
   */
  seenToolUseIds: Set<string>;
}

export type Effect =
  | {
      kind: 'capture_session_id';
      sessionId: string;
    }
  | {
      kind: 'patch_message';
      messageId: string;
      appendText?: string;
      status?: 'streaming' | 'complete' | 'error';
      usage?: unknown;
      totalCostUsd?: number;
    }
  | {
      kind: 'add_block';
      messageId: string;
      block: {
        type: 'tool_use' | 'thinking' | 'error' | 'permission_request';
        id?: string;
        [k: string]: unknown;
      };
    }
  | {
      kind: 'patch_block';
      messageId: string;
      blockId: string;
      patch: Record<string, unknown>;
    }
  | {
      kind: 'add_artifact';
      threadId: string;
      artifact: {
        type: string;
        title: string;
        content: unknown;
      };
    }
  | {
      kind: 'finalize';
      messageId: string;
      usage?: unknown;
      totalCostUsd?: number;
    };

/**
 * Dig into a parsed stream-json event and return the list of effects it
 * produces. Unknown events return `[]`.
 */
export function translate(
  event: unknown,
  ctx: TranslatorContext,
): Effect[] {
  if (!event || typeof event !== 'object') return [];
  const ev = event as Record<string, unknown>;
  const type = ev.type as string | undefined;

  switch (type) {
    case 'system':
      return translateSystem(ev, ctx);
    case 'stream_event':
      return translateStreamEvent(ev, ctx);
    case 'assistant':
      return translateAssistant(ev, ctx);
    case 'user':
      // user replay / tool_result carriers — tool_result handled in translateUser
      return translateUser(ev, ctx);
    case 'result':
      return translateResult(ev, ctx);
    default:
      return [];
  }
}

function translateSystem(ev: Record<string, unknown>, _ctx: TranslatorContext): Effect[] {
  const subtype = ev.subtype as string | undefined;
  if (subtype === 'init') {
    const sessionId = (ev.session_id ?? ev.sessionId) as string | undefined;
    if (sessionId) {
      return [{ kind: 'capture_session_id', sessionId }];
    }
  }
  return [];
}

/**
 * Partial content-block deltas (the `--include-partial-messages` firehose).
 * The wrapper shape is roughly:
 *   { type: 'stream_event', event: { type: 'content_block_delta'|..., delta?, ... } }
 * We only translate text deltas → append_text on the placeholder message.
 */
function translateStreamEvent(ev: Record<string, unknown>, ctx: TranslatorContext): Effect[] {
  const inner = ev.event as Record<string, unknown> | undefined;
  if (!inner) return [];

  const innerType = inner.type as string | undefined;

  // content_block_delta: { delta: { type: 'text_delta', text: '...' } }
  if (innerType === 'content_block_delta') {
    const delta = inner.delta as Record<string, unknown> | undefined;
    const deltaType = delta?.type as string | undefined;
    if (deltaType === 'text_delta' && typeof delta?.text === 'string') {
      return [
        {
          kind: 'patch_message',
          messageId: ctx.placeholderMessageId,
          appendText: delta.text as string,
          status: 'streaming',
        },
      ];
    }
    if (deltaType === 'thinking_delta' && typeof delta?.thinking === 'string') {
      // Treat thinking deltas as append to a thinking block. The simplest
      // correct thing is to surface them as block additions; the frontend
      // thinking block merges repeated text.
      return [
        {
          kind: 'add_block',
          messageId: ctx.placeholderMessageId,
          block: { type: 'thinking', text: delta.thinking as string },
        },
      ];
    }
  }

  // content_block_start: first time we see a tool_use or thinking block id.
  if (innerType === 'content_block_start') {
    const contentBlock = inner.content_block as Record<string, unknown> | undefined;
    const cbType = contentBlock?.type as string | undefined;
    if (cbType === 'tool_use') {
      const blockId = contentBlock?.id as string | undefined;
      if (blockId && !ctx.seenToolUseIds.has(blockId)) {
        ctx.seenToolUseIds.add(blockId);
        return [
          {
            kind: 'add_block',
            messageId: ctx.placeholderMessageId,
            block: {
              type: 'tool_use',
              id: blockId,
              name: contentBlock?.name,
              input: contentBlock?.input ?? {},
              status: 'running',
            },
          },
        ];
      }
    }
  }

  return [];
}

/**
 * Full assistant message. We usually already rendered the pieces via
 * stream-event deltas; this serves as a consistency anchor — mark the
 * placeholder message as still-streaming (not yet complete) and ensure
 * any tool_use blocks we missed become visible.
 */
function translateAssistant(ev: Record<string, unknown>, ctx: TranslatorContext): Effect[] {
  const effects: Effect[] = [];
  const message = ev.message as Record<string, unknown> | undefined;
  const content = (message?.content ?? []) as Array<Record<string, unknown>>;
  for (const block of content) {
    const blockType = block.type as string | undefined;
    if (blockType === 'tool_use') {
      const blockId = block.id as string | undefined;
      if (blockId && !ctx.seenToolUseIds.has(blockId)) {
        ctx.seenToolUseIds.add(blockId);
        effects.push({
          kind: 'add_block',
          messageId: ctx.placeholderMessageId,
          block: {
            type: 'tool_use',
            id: blockId,
            name: block.name,
            input: block.input ?? {},
            status: 'running',
          },
        });
      }
    } else if (blockType === 'thinking') {
      effects.push({
        kind: 'add_block',
        messageId: ctx.placeholderMessageId,
        block: { type: 'thinking', text: (block.thinking as string) ?? '' },
      });
    }
  }
  return effects;
}

/**
 * `user` role events include replayed user messages and tool_result blocks.
 * We ignore the user message replay (we already persisted it) and translate
 * tool_result blocks into `patch_block` effects on the matching tool_use.
 */
function translateUser(ev: Record<string, unknown>, ctx: TranslatorContext): Effect[] {
  const effects: Effect[] = [];
  const message = ev.message as Record<string, unknown> | undefined;
  const content = (message?.content ?? []) as Array<Record<string, unknown>>;
  for (const block of content) {
    const blockType = block.type as string | undefined;
    if (blockType === 'tool_result') {
      const toolUseId = (block.tool_use_id ?? block.toolUseId) as string | undefined;
      if (!toolUseId) continue;
      const isError = block.is_error === true;
      effects.push({
        kind: 'patch_block',
        messageId: ctx.placeholderMessageId,
        blockId: toolUseId,
        patch: {
          status: isError ? 'error' : 'done',
          output: block.content ?? block.output ?? null,
        },
      });
    }
  }
  return effects;
}

/**
 * Terminal `result` event — usage, cost, finish reason.
 */
function translateResult(ev: Record<string, unknown>, ctx: TranslatorContext): Effect[] {
  const usage = ev.usage;
  const totalCostUsd = (ev.total_cost_usd ?? ev.totalCostUsd) as number | undefined;
  return [
    {
      kind: 'finalize',
      messageId: ctx.placeholderMessageId,
      usage,
      totalCostUsd,
    },
  ];
}
