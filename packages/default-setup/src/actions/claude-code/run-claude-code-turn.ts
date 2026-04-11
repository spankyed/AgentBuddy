import type { ActionMeta, Services, Z } from '../../types';

export const meta: ActionMeta = {
  label: 'Run Claude Code Turn',
  description: 'Execute one Claude Code turn: send the user text to the CLI, stream events back to the thread chat, and await any tool-approval prompts.',
  category: 'claude-code',
  input: {
    threadId: { type: 'string', description: 'Thread hosting the turn', required: true },
    text: { type: 'string', description: 'User message text', required: true },
    references: { type: 'object', description: 'Optional file/image references', required: false },
  },
};

export async function action(
  params: Record<string, any>,
  services: Services,
  z: Z,
  _flowId: string,
) {
  const schema = z.object({
    threadId: z.string(),
    text: z.string(),
    references: z.any().optional(),
  });
  const parsed = schema.safeParse(params);
  if (!parsed.success) {
    return { success: false, error: parsed.error.message };
  }

  const { threadId, text } = parsed.data;

  const session = services.claudeCode.getSession(threadId as any);
  if (!session) {
    services.chat.sendBlockMessage({
      threadId: threadId as any,
      text: 'No Claude Code session is bound to this thread.',
      blocks: [{ type: 'error', props: { text: 'Session missing — recreate the thread.' } }],
      forkable: false,
    });
    return { success: false, error: 'No session' };
  }

  // Placeholder assistant message that streaming deltas will append into.
  const placeholder = services.chat.sendBlockMessage({
    threadId: threadId as any,
    text: '',
    blocks: [],
    forkable: false,
  });
  const placeholderId = placeholder.messageId as string;

  // Seen tool_use ids, to dedupe add_block between stream_event + assistant.
  const seenToolUseIds = new Set<string>();
  // Map requestId → messageId of permission_request block message.
  const permissionBlockByRequestId = new Map<string, string>();

  // Buffer deltas locally so each patch sends the full accumulated text.
  let accumulatedText = '';
  const appendTextToPlaceholder = (token: string) => {
    accumulatedText += token;
    services.chat.updateMessageState(placeholderId as any, { text: accumulatedText });
  };

  const patchPlaceholderBlocks = (patcher: (blocks: any[]) => any[]) => {
    const msg = services.repository.chatQueries.messageById(placeholderId as any);
    if (!msg) return;
    const nextBlocks = patcher(msg.blocks || []);
    services.chat.updateMessageState(placeholderId as any, { blocks: nextBlocks });
  };

  const addBlock = (block: any) => {
    patchPlaceholderBlocks((blocks) => [...blocks, block]);
  };

  const patchBlockById = (blockId: string, patch: Record<string, any>) => {
    patchPlaceholderBlocks((blocks) =>
      blocks.map((b: any) =>
        b?.props?.id === blockId ? { ...b, props: { ...b.props, ...patch } } : b,
      ),
    );
  };

  const handleEvent = (event: any) => {
    if (!event || typeof event !== 'object') return;
    const type = event.type as string | undefined;

    if (type === 'stream_event') {
      const inner = event.event;
      if (!inner) return;

      if (inner.type === 'content_block_delta') {
        const delta = inner.delta;
        if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
          appendTextToPlaceholder(delta.text);
        }
      } else if (inner.type === 'content_block_start') {
        const cb = inner.content_block;
        if (cb?.type === 'tool_use') {
          const blockId = cb.id as string | undefined;
          if (blockId && !seenToolUseIds.has(blockId)) {
            seenToolUseIds.add(blockId);
            addBlock({
              type: 'tool_use',
              props: {
                id: blockId,
                name: cb.name,
                input: cb.input ?? {},
                status: 'running',
              },
            });
          }
        } else if (cb?.type === 'thinking') {
          addBlock({
            type: 'thinking',
            props: { text: cb.thinking ?? '' },
          });
        }
      }
      return;
    }

    if (type === 'user') {
      // Replay or tool_result carrier — patch matching tool_use blocks.
      const content = event.message?.content;
      if (!Array.isArray(content)) return;
      for (const b of content) {
        if (b?.type === 'tool_result') {
          const toolUseId = b.tool_use_id ?? b.toolUseId;
          if (toolUseId) {
            patchBlockById(toolUseId, {
              status: b.is_error ? 'error' : 'done',
              output: b.content ?? b.output ?? null,
            });
          }
        }
      }
      return;
    }

    if (type === 'result') {
      // Finalize — fields read by the runTurn promise via lastUsage/lastCost.
    }
  };

  try {
    const result = await services.claudeCode.runTurn(
      { session, text },
      {
        onEvent: handleEvent,
        onPermissionRequest: async (req) => {
          // Post a permission_request block message to the thread.
          const msg = services.chat.sendBlockMessage({
            threadId: threadId as any,
            text: `Claude Code wants to use ${req.toolName}`,
            blocks: [
              {
                type: 'permission_request',
                props: {
                  requestId: req.requestId,
                  toolName: req.toolName,
                  input: req.toolInput,
                  status: 'pending',
                },
              },
            ],
            forkable: false,
          });
          permissionBlockByRequestId.set(req.requestId, msg.messageId as string);

          // Register a deferred so the Resolve action can signal us back.
          let resolveDeferred!: (d: any) => void;
          const promise = new Promise<any>((resolve) => {
            resolveDeferred = resolve;
          });
          services.claudeCode.pendingPermissions.register(req.requestId, {
            deferred: {
              promise,
              resolve: resolveDeferred,
              reject: () => {},
            } as any,
            turnId: req.turnId,
            request: req,
          });

          const ui = await promise;
          // Update the permission_request block message to reflect the
          // chosen decision (disabled/resolved).
          const msgId = permissionBlockByRequestId.get(req.requestId);
          if (msgId) {
            services.chat.updateMessageState(msgId as any, {
              blocks: [
                {
                  type: 'permission_request',
                  props: {
                    requestId: req.requestId,
                    toolName: req.toolName,
                    input: req.toolInput,
                    status: ui.decision || 'resolved',
                  },
                },
              ],
            });
          }

          // Translate 'allow_session' → 'allow' at the MCP boundary (the
          // service keeps its own "remember for session" map if needed).
          const wireDecision: 'allow' | 'deny' = ui.decision === 'deny' ? 'deny' : 'allow';
          return { decision: wireDecision };
        },
        onSessionIdCaptured: (sessionId) => {
          try {
            services.claudeCode.attachSessionId(threadId as any, sessionId);
          } catch {
            // ignore
          }
        },
      },
    );

    return {
      success: true,
      usage: result.usage,
      totalCostUsd: result.totalCostUsd,
      exitCode: result.exitCode,
    };
  } catch (err: any) {
    const message = err?.message || 'Claude Code turn failed';
    services.chat.sendBlockMessage({
      threadId: threadId as any,
      text: `Turn error: ${message}`,
      blocks: [{ type: 'error', props: { text: message } }],
      forkable: false,
    });
    return { success: false, error: message };
  }
}
