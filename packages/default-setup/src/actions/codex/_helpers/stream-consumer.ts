/**
 * Codex agentic loop — fire-and-forget async function that drives the
 * OpenAI Chat Completions streaming client in a tool-calling loop.
 *
 * Uses `services.cli.codex.stream()` (the codex-client service) to make
 * raw HTTP requests with SSE parsing, replicating Codex's Rust client.
 *
 * Flow:
 *  1. Call stream() → parse SSE → text deltas to UI
 *  2. If tool calls returned:
 *     a. Read-only shell → auto-approve, execute, add result, loop
 *     b. Write shell / apply_patch → pause, emit cx.stream.paused, return
 *  3. If no tool calls → finalize, emit cx.stream.completed
 */

import type { Services, EntityId } from '../../../types';
import { createStreamWriter } from '../../claude-code/_helpers/stream-writer';
import { createToolActivityWriter } from '../../claude-code/_helpers/tool-activity-writer';
import {
  getCodexState,
  persistCodexState,
  setRunning,
  dequeueMessage,
  updateChatState,
  DEFAULT_MODEL,
} from './thread-context';
import type { SerializedMessage } from './thread-context';
import { createToolDefinitions, isReadOnlyCommand } from './tools';
import { executeToolCall } from './tool-executor';

export interface ConsumerContext {
  services: Services;
  threadId: EntityId;
  text: string;
  phase?: string;
  userMessageId?: string;
}

export interface ConsumerWriters {
  writer: ReturnType<typeof createStreamWriter>;
  toolActivity: ReturnType<typeof createToolActivityWriter>;
  messageId: EntityId;
}

/**
 * Run the agentic loop. The chat action calls this without awaiting it.
 */
export async function consumeStream(
  ctx: ConsumerContext,
  initialWriters: ConsumerWriters,
): Promise<void> {
  const { services, threadId } = ctx;
  const log = services.logger;

  let writer = initialWriters.writer;
  let toolActivity = initialWriters.toolActivity;

  try {
    const state = getCodexState(services, threadId);
    const model = state?.model || DEFAULT_MODEL;
    const cwd = state?.cwd || '';

    // Build conversation history in Chat Completions format
    const history: SerializedMessage[] = state?.conversationHistory || [];

    // Get API key
    const apiKey = await (services.cli as any).codex.getApiKey();
    if (!apiKey) {
      writer.finalize('Not authenticated. Please log in with Codex first.');
      setRunning(services, threadId, false);
      updateChatState(services, threadId, 'error');
      return;
    }

    // Get system prompt
    let systemPrompt: string;
    try {
      systemPrompt = services.prompt.usePrompt('Codex System', { cwd });
    } catch {
      systemPrompt = `You are a coding assistant. Working directory: ${cwd}`;
    }

    const toolDefs = createToolDefinitions();

    // Emit stream started
    services.emitter.sendToBrainSystem({
      eventType: 'cx.stream.started',
      payload: { threadId, model, cwd },
    } as any);

    // ─── Agentic loop ─────────────────────────────────────────────────
    let turns = 0;
    const MAX_TURNS = 50;

    while (turns < MAX_TURNS) {
      turns++;

      // Call the codex-client stream service
      const handle = await (services.cli as any).codex.stream({
        apiKey,
        model,
        instructions: systemPrompt,
        messages: history,
        tools: toolDefs,
      });

      // Stream text deltas to the UI
      for await (const ev of handle.events) {
        if (ev.type === 'text_delta') {
          writer.push(ev.text);
        } else if (ev.type === 'tool_call_done') {
          const tc = ev.toolCall;
          toolActivity.append({
            id: tc.id,
            tool: tc.function.name,
            summary: summarizeToolCall(tc.function.name, tc.function.arguments),
            status: 'running',
          });
        } else if (ev.type === 'error') {
          log.error('stream event error', { message: ev.message });
        }
      }

      // Get the final result
      const result = await handle.result;

      // Append assistant message to history
      if (result.content || result.toolCalls.length > 0) {
        const assistantMsg: SerializedMessage = {
          role: 'assistant',
          content: result.content || null,
        };
        if (result.toolCalls.length > 0) {
          (assistantMsg as any).tool_calls = result.toolCalls;
        }
        history.push(assistantMsg);
      }

      // Update token usage
      if (result.usage) {
        const existing = state?.totalTokens || 0;
        persistCodexState(services, threadId, {
          totalTokens: existing + result.usage.totalTokens,
        });
      }

      // No tool calls → done
      if (result.toolCalls.length === 0) {
        break;
      }

      // Process tool calls
      for (const tc of result.toolCalls) {
        const { id: toolCallId, function: fn } = tc;
        const toolName = fn.name;
        let args: any;
        try { args = JSON.parse(fn.arguments); } catch { args = {}; }

        log.debug('executing tool', { toolName, toolCallId });

        // Check if auto-approvable
        const isAutoApprove = toolName === 'shell' && Array.isArray(args.command) && isReadOnlyCommand(args.command);

        if (isAutoApprove) {
          // Execute immediately
          const toolResult = await executeToolCall(services, toolName, fn.arguments, cwd);
          toolActivity.update(toolCallId, {
            status: toolResult.isError ? 'error' : 'ok',
          });

          // Add tool result to history (Chat Completions format)
          history.push({
            role: 'tool',
            content: toolResult.output,
            tool_call_id: toolCallId,
          } as any);
        } else {
          // Requires approval — pause the loop
          writer.flush();
          toolActivity.flush();

          // Send approval block
          const approvalMsg = services.chat.sendBlockMessage({
            threadId,
            text: `${toolName}: ${summarizeToolCall(toolName, fn.arguments)}`,
            blocks: [
              {
                type: 'approval',
                props: {
                  toolName,
                  args,
                  toolCallId,
                } as any,
              },
            ],
            forkable: false,
            autoHide: true,
            asUser: false,
            asideContext: 'Permission',
          } as any);

          // Persist state for resume
          persistCodexState(services, threadId, {
            conversationHistory: history,
            pendingToolCall: {
              toolCallId,
              toolName,
              args,
              approvalMessageId: approvalMsg.messageId as string,
            },
            turns: (state?.turns || 0) + turns,
          });

          setRunning(services, threadId, false);
          updateChatState(services, threadId, 'paused');

          services.emitter.sendToBrainSystem({
            eventType: 'cx.stream.paused',
            payload: { threadId, toolName, toolCallId },
          } as any);

          return; // Will resume from approve-tool action
        }
      }

      // All tool calls auto-approved — persist history periodically
      if (turns % 5 === 0) {
        persistCodexState(services, threadId, { conversationHistory: history });
      }
    }

    // ─── Done ───────────────────────────────────────────────────────────
    writer.finalize();
    toolActivity.finalise('done');

    persistCodexState(services, threadId, {
      conversationHistory: history,
      turns: (state?.turns || 0) + turns,
    });

    const queued = dequeueMessage(services, threadId);
    setRunning(services, threadId, false);

    services.emitter.sendToBrainSystem({
      eventType: 'cx.stream.completed',
      payload: { threadId, text: ctx.text },
    } as any);

    updateChatState(services, threadId, 'idle');

    // Replay queued message
    if (queued) {
      services.emitter.sendToBrainSystem({
        eventType: 'user.message',
        payload: {
          threadId,
          text: queued.text,
          mode: queued.mode || 'codex',
          phase: queued.phase,
          messageId: queued.messageId,
          references: queued.references,
        },
      } as any);
    }

  } catch (err: any) {
    const msg = err?.message || 'Codex request failed';
    log.error('consumeStream error', { err: msg });

    writer.finalize(`⚠️ ${msg}`);
    toolActivity.finalise('error');
    setRunning(services, threadId, false);
    updateChatState(services, threadId, 'idle');

    services.emitter.sendToBrainSystem({
      eventType: 'cx.stream.completed',
      payload: { threadId, text: ctx.text, error: msg },
    } as any);

    services.emitter.sendToPlugin('threads', {
      type: 'FLASH_CHAT_STATE',
      threadId,
      stateId: 'error',
      durationMs: 3000,
    } as any);
  }
}

function summarizeToolCall(toolName: string, argsJson: string): string {
  try {
    const args = JSON.parse(argsJson);
    if (toolName === 'shell' && Array.isArray(args.command)) {
      return args.command.join(' ').slice(0, 120);
    }
    if (toolName === 'apply_patch') {
      const lines = (args.command?.[1] || '').split('\n').length;
      return `apply patch (${lines} lines)`;
    }
  } catch { /* ignore */ }
  return toolName;
}
