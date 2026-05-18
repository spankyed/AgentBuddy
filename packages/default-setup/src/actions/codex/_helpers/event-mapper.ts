/**
 * Maps Codex SDK ThreadItem types to writer/toolActivity calls.
 *
 * The SDK delivers full text snapshots in `item.updated` events (not deltas).
 * This module handles delta extraction by diffing against previous snapshots
 * and dispatching to the appropriate writer.
 */

import type { ToolActivityWriter } from '../../claude-code/_helpers/tool-activity-writer';
import type { StreamWriter } from '../../claude-code/_helpers/stream-writer';
import type { ThinkingWriter } from '../../claude-code/_helpers/thinking-writer';

export interface EventMapperState {
  /** Last seen full text for agent_message — for delta extraction. */
  lastAgentText: string;
  /** Last seen full text for reasoning — for delta extraction. */
  lastReasoningText: string;
  /** File paths mutated by file_change items (for diff artifact). */
  mutatedPaths: string[];
  mutatedPathsSet: Set<string>;
  /** Total tool calls in this turn (for rolling counter). */
  toolCallCount: number;
}

export function createEventMapperState(): EventMapperState {
  return {
    lastAgentText: '',
    lastReasoningText: '',
    mutatedPaths: [],
    mutatedPathsSet: new Set(),
    toolCallCount: 0,
  };
}

export interface Writers {
  writer: StreamWriter;
  toolActivity: ToolActivityWriter;
  thinking: ThinkingWriter;
}

/**
 * Handle an item.started event. Sets up toolActivity entries for tool items.
 */
export function handleItemStarted(
  item: any,
  writers: Writers,
  state: EventMapperState,
): void {
  const { toolActivity, thinking, writer } = writers;

  switch (item.type) {
    case 'agent_message':
      // Reset delta tracking for new message
      state.lastAgentText = '';
      break;

    case 'reasoning':
      state.lastReasoningText = '';
      break;

    case 'command_execution':
      state.toolCallCount++;
      thinking.finalise();
      thinking.stopDirectWrites();
      writer.flush();
      toolActivity.append({
        id: item.id,
        tool: 'command',
        summary: item.command || '',
        status: 'running',
        details: { input: { command: item.command } },
      });
      break;

    case 'file_change':
      // Wait for completion to get the full changes list
      break;

    case 'mcp_tool_call':
      state.toolCallCount++;
      thinking.finalise();
      thinking.stopDirectWrites();
      writer.flush();
      toolActivity.append({
        id: item.id,
        tool: `${item.server}/${item.tool}`,
        summary: item.tool || '',
        status: 'running',
        details: { input: item.arguments },
      });
      break;

    case 'web_search':
      state.toolCallCount++;
      thinking.finalise();
      thinking.stopDirectWrites();
      writer.flush();
      toolActivity.append({
        id: item.id,
        tool: 'web_search',
        summary: item.query || '',
        status: 'running',
      });
      break;

    case 'todo_list':
      // Could render as a toolActivity entry or custom block
      break;

    case 'error':
      toolActivity.append({
        id: item.id,
        tool: 'error',
        summary: item.message || 'Error',
        status: 'error',
      });
      break;
  }
}

/**
 * Handle an item.updated event. Extracts deltas from full text snapshots
 * and pushes to the appropriate writer.
 */
export function handleItemUpdated(
  item: any,
  writers: Writers,
  state: EventMapperState,
  services: any,
  messageId: any,
): void {
  const { writer, thinking } = writers;

  switch (item.type) {
    case 'agent_message': {
      const newText = item.text || '';
      if (newText.length > state.lastAgentText.length) {
        const delta = newText.slice(state.lastAgentText.length);
        // Clear "Thinking…" placeholder on first text
        if (!state.lastAgentText && !thinking.hasContent) {
          services.chat.updateMessageState(messageId, { text: '' });
        }
        thinking.finalise();
        writer.push(delta);
      }
      state.lastAgentText = newText;
      break;
    }

    case 'reasoning': {
      const newText = item.text || '';
      if (newText.length > state.lastReasoningText.length) {
        const delta = newText.slice(state.lastReasoningText.length);
        // Clear "Thinking…" placeholder on first reasoning
        if (!state.lastReasoningText && !thinking.hasContent) {
          services.chat.updateMessageState(messageId, { text: '' });
        }
        thinking.push(delta);
      }
      state.lastReasoningText = newText;
      break;
    }

    case 'command_execution': {
      // Update toolActivity with output preview
      const output = item.aggregated_output || '';
      if (output) {
        const preview = output.length > 200 ? output.slice(-200) : output;
        writers.toolActivity.update(item.id, {
          details: { input: { command: item.command }, output: preview },
        });
      }
      break;
    }
  }
}

/**
 * Handle an item.completed event. Finalizes toolActivity entries and
 * tracks mutated file paths.
 */
export function handleItemCompleted(
  item: any,
  writers: Writers,
  state: EventMapperState,
): void {
  const { writer, toolActivity, thinking } = writers;

  switch (item.type) {
    case 'agent_message': {
      // Final flush of any remaining delta
      const newText = item.text || '';
      if (newText.length > state.lastAgentText.length) {
        const delta = newText.slice(state.lastAgentText.length);
        thinking.finalise();
        writer.push(delta);
      }
      state.lastAgentText = newText;
      break;
    }

    case 'reasoning': {
      const newText = item.text || '';
      if (newText.length > state.lastReasoningText.length) {
        const delta = newText.slice(state.lastReasoningText.length);
        thinking.push(delta);
      }
      state.lastReasoningText = newText;
      thinking.finalise();
      break;
    }

    case 'command_execution': {
      const ok = item.status === 'completed' && (item.exit_code === 0 || item.exit_code === undefined);
      toolActivity.update(item.id, {
        status: ok ? 'ok' : 'error',
        details: {
          input: { command: item.command },
          output: item.aggregated_output || '',
        },
      });
      break;
    }

    case 'file_change': {
      state.toolCallCount++;
      thinking.finalise();
      thinking.stopDirectWrites();
      writer.flush();
      const changes = item.changes || [];
      for (const change of changes) {
        const p = change.path;
        if (typeof p === 'string' && !state.mutatedPathsSet.has(p)) {
          state.mutatedPathsSet.add(p);
          state.mutatedPaths.push(p);
        }
      }
      // Append a summary toolActivity entry for the file change
      const summary = changes.map((c: any) => `${c.kind}: ${c.path}`).join(', ');
      toolActivity.append({
        id: item.id,
        tool: 'file_change',
        summary: summary || 'File changes',
        status: item.status === 'completed' ? 'ok' : 'error',
      });
      break;
    }

    case 'mcp_tool_call': {
      const ok = item.status === 'completed';
      toolActivity.update(item.id, {
        status: ok ? 'ok' : 'error',
        ...(item.error ? { details: { output: item.error.message } } : {}),
      });
      break;
    }

    case 'web_search': {
      toolActivity.update(item.id, { status: 'ok' });
      break;
    }

    case 'error': {
      toolActivity.update(item.id, { status: 'error' });
      break;
    }
  }
}
