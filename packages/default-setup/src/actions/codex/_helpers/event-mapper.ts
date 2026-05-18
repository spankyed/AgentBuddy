/**
 * Maps Codex SDK ThreadItem events to writer/toolActivity calls.
 * Handles delta extraction from full text snapshots (SDK delivers complete
 * text, not deltas).
 */

import type { ToolActivityWriter } from '../../claude-code/_helpers/tool-activity-writer';
import type { StreamWriter } from '../../claude-code/_helpers/stream-writer';
import type { ThinkingWriter } from '../../claude-code/_helpers/thinking-writer';

export interface EventMapperState {
  lastAgentText: string;
  lastReasoningText: string;
  mutatedPaths: string[];
  mutatedPathsSet: Set<string>;
  toolCallCount: number;
}

export function createEventMapperState(): EventMapperState {
  return { lastAgentText: '', lastReasoningText: '', mutatedPaths: [], mutatedPathsSet: new Set(), toolCallCount: 0 };
}

export interface Writers {
  writer: StreamWriter;
  toolActivity: ToolActivityWriter;
  thinking: ThinkingWriter;
}

export interface ToolInfo { name: string; summary: string }

/** Extract delta from a full text snapshot vs previous snapshot. */
function extractDelta(newText: string, prev: string): string | null {
  return newText.length > prev.length ? newText.slice(prev.length) : null;
}

/** Prepare writers for tool activity (finalize thinking, flush text). */
function prepareForTool(writers: Writers) {
  writers.thinking.finalise();
  writers.thinking.stopDirectWrites();
  writers.writer.flush();
}

/** Clear the "Thinking…" placeholder on first content. */
function clearPlaceholderIfNeeded(thinking: ThinkingWriter, prev: string, services: any, messageId: any) {
  if (!prev && !thinking.hasContent) {
    services.chat.updateMessageState(messageId, { text: '' });
  }
}

/**
 * Handle item.started. Returns tool info for recentTools tracking, or null
 * for non-tool items.
 */
export function handleItemStarted(item: any, writers: Writers, state: EventMapperState): ToolInfo | null {
  const { toolActivity } = writers;

  switch (item.type) {
    case 'agent_message':
      state.lastAgentText = '';
      return null;

    case 'reasoning':
      state.lastReasoningText = '';
      return null;

    case 'command_execution':
      state.toolCallCount++;
      prepareForTool(writers);
      toolActivity.append({ id: item.id, tool: 'command', summary: item.command || '', status: 'running', details: { input: { command: item.command } } });
      return { name: 'command', summary: item.command || '' };

    case 'mcp_tool_call':
      state.toolCallCount++;
      prepareForTool(writers);
      toolActivity.append({ id: item.id, tool: `${item.server}/${item.tool}`, summary: item.tool || '', status: 'running', details: { input: item.arguments } });
      return { name: `${item.server}/${item.tool}`, summary: item.tool || '' };

    case 'web_search':
      state.toolCallCount++;
      prepareForTool(writers);
      toolActivity.append({ id: item.id, tool: 'web_search', summary: item.query || '', status: 'running' });
      return { name: 'web_search', summary: item.query || '' };

    case 'error':
      toolActivity.append({ id: item.id, tool: 'error', summary: item.message || 'Error', status: 'error' });
      return null;

    default:
      return null;
  }
}

export function handleItemUpdated(item: any, writers: Writers, state: EventMapperState, services: any, messageId: any): void {
  switch (item.type) {
    case 'agent_message': {
      const delta = extractDelta(item.text || '', state.lastAgentText);
      if (delta) {
        clearPlaceholderIfNeeded(writers.thinking, state.lastAgentText, services, messageId);
        writers.thinking.finalise();
        writers.writer.push(delta);
      }
      state.lastAgentText = item.text || '';
      break;
    }
    case 'reasoning': {
      const delta = extractDelta(item.text || '', state.lastReasoningText);
      if (delta) {
        clearPlaceholderIfNeeded(writers.thinking, state.lastReasoningText, services, messageId);
        writers.thinking.push(delta);
      }
      state.lastReasoningText = item.text || '';
      break;
    }
    case 'command_execution': {
      const output = item.aggregated_output || '';
      if (output) {
        writers.toolActivity.update(item.id, { details: { input: { command: item.command }, output: output.slice(-200) } });
      }
      break;
    }
  }
}

export function handleItemCompleted(item: any, writers: Writers, state: EventMapperState): void {
  switch (item.type) {
    case 'agent_message': {
      const delta = extractDelta(item.text || '', state.lastAgentText);
      if (delta) { writers.thinking.finalise(); writers.writer.push(delta); }
      state.lastAgentText = item.text || '';
      break;
    }
    case 'reasoning': {
      const delta = extractDelta(item.text || '', state.lastReasoningText);
      if (delta) writers.thinking.push(delta);
      state.lastReasoningText = item.text || '';
      writers.thinking.finalise();
      break;
    }
    case 'command_execution': {
      const ok = item.status === 'completed' && (item.exit_code === 0 || item.exit_code === undefined);
      writers.toolActivity.update(item.id, { status: ok ? 'ok' : 'error', details: { input: { command: item.command }, output: item.aggregated_output || '' } });
      break;
    }
    case 'file_change': {
      state.toolCallCount++;
      prepareForTool(writers);
      for (const change of (item.changes || [])) {
        if (typeof change.path === 'string' && !state.mutatedPathsSet.has(change.path)) {
          state.mutatedPathsSet.add(change.path);
          state.mutatedPaths.push(change.path);
        }
      }
      const summary = (item.changes || []).map((c: any) => `${c.kind}: ${c.path}`).join(', ');
      writers.toolActivity.append({ id: item.id, tool: 'file_change', summary: summary || 'File changes', status: item.status === 'completed' ? 'ok' : 'error' });
      break;
    }
    case 'mcp_tool_call': {
      writers.toolActivity.update(item.id, { status: item.status === 'completed' ? 'ok' : 'error', ...(item.error ? { details: { output: item.error.message } } : {}) });
      break;
    }
    case 'web_search':
      writers.toolActivity.update(item.id, { status: 'ok' });
      break;
    case 'error':
      writers.toolActivity.update(item.id, { status: 'error' });
      break;
  }
}
