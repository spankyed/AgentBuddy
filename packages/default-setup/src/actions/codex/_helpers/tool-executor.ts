/**
 * Tool execution engine for the Codex agentic loop.
 *
 * Dispatches tool calls to `services.cli.shell()`. Codex uses only two tools
 * (shell and apply_patch), and both are executed as shell commands.
 */

import type { Services } from '../../../types';

export interface ToolResult {
  output: string;
  isError?: boolean;
}

/**
 * Execute a tool call and return its output.
 *
 * Tool arguments follow Codex's format where both `shell` and `apply_patch`
 * receive a `command` array.
 */
export async function executeToolCall(
  services: Services,
  toolName: string,
  argsJson: string,
  cwd: string,
): Promise<ToolResult> {
  try {
    const args = JSON.parse(argsJson);

    switch (toolName) {
      case 'shell':
        return await execShell(services, args, cwd);
      case 'apply_patch':
        return await execApplyPatch(services, args, cwd);
      default:
        return { output: `Unknown tool: ${toolName}`, isError: true };
    }
  } catch (err: any) {
    return { output: err?.message || String(err), isError: true };
  }
}

async function execShell(
  services: Services,
  args: { command: string[]; workdir?: string; timeout_ms?: number },
  cwd: string,
): Promise<ToolResult> {
  const command = Array.isArray(args.command) ? args.command.join(' ') : String(args.command);
  const workdir = args.workdir || cwd;
  const timeout = args.timeout_ms ?? 30_000;

  try {
    const output = await (services.cli as any).shell(command, { cwd: workdir, timeout });
    return { output: truncateOutput(output || '(no output)') };
  } catch (err: any) {
    return { output: truncateOutput(err?.message || String(err)), isError: true };
  }
}

async function execApplyPatch(
  services: Services,
  args: { command: string[] },
  cwd: string,
): Promise<ToolResult> {
  // apply_patch receives command as ["apply_patch", "<patch_content>"]
  const patchContent = Array.isArray(args.command) && args.command.length > 1
    ? args.command.slice(1).join(' ')
    : '';

  if (!patchContent) {
    return { output: 'No patch content provided', isError: true };
  }

  try {
    // Use git apply to apply the patch
    const escaped = patchContent.replace(/'/g, "'\\''");
    const output = await (services.cli as any).shell(
      `echo '${escaped}' | git apply --verbose -`,
      { cwd },
    );
    return { output: output || 'Patch applied successfully' };
  } catch (err: any) {
    // Fallback: try without git
    try {
      const escaped = patchContent.replace(/'/g, "'\\''");
      const output = await (services.cli as any).shell(
        `echo '${escaped}' | patch -p1`,
        { cwd },
      );
      return { output: output || 'Patch applied successfully' };
    } catch (err2: any) {
      return { output: `Failed to apply patch: ${err2.message}`, isError: true };
    }
  }
}

/** Truncate output to ~10KB to match Codex's 256-line / 10KB limit. */
function truncateOutput(text: string): string {
  const MAX_BYTES = 10_240;
  const MAX_LINES = 256;
  const lines = text.split('\n');
  if (lines.length > MAX_LINES) {
    return lines.slice(0, MAX_LINES).join('\n') + `\n... (truncated, ${lines.length - MAX_LINES} more lines)`;
  }
  if (text.length > MAX_BYTES) {
    return text.slice(0, MAX_BYTES) + '\n... (truncated)';
  }
  return text;
}
