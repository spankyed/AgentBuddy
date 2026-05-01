/**
 * Tool definitions for the Codex agentic loop.
 *
 * Produces the exact JSON Schema format Codex uses for the Chat Completions API:
 *   codex-rs/core/src/openai_tools.rs
 *
 * Codex uses only two tools: `shell` and `apply_patch`. All read operations
 * (cat, ls, rg, find, etc.) go through the shell tool. Auto-approval is
 * determined by inspecting the command.
 */

/** Shell commands that are safe to auto-approve (read-only). */
const READ_ONLY_PREFIXES = [
  'cat ', 'head ', 'tail ', 'less ', 'more ',
  'ls ', 'ls\n', 'dir ',
  'rg ', 'grep ', 'ag ',
  'find ', 'fd ',
  'wc ', 'file ', 'stat ',
  'pwd', 'echo ', 'printf ',
  'git log', 'git show', 'git diff', 'git status', 'git blame', 'git branch',
  'which ', 'type ', 'env', 'printenv',
  'tree ', 'du ', 'df ',
];

/**
 * Check if a shell command is read-only and can be auto-approved.
 */
export function isReadOnlyCommand(command: string[]): boolean {
  const joined = command.join(' ').trim();
  return READ_ONLY_PREFIXES.some(prefix => joined.startsWith(prefix));
}

/**
 * Create tool definitions in the Chat Completions API format.
 * These are plain JSON objects — no Zod dependency needed.
 */
export function createToolDefinitions() {
  return [
    {
      type: 'function' as const,
      function: {
        name: 'shell',
        description: 'Runs a shell command and returns its output',
        parameters: {
          type: 'object',
          properties: {
            command: {
              type: 'array',
              items: { type: 'string' },
              description: 'The command to execute as an array of arguments',
            },
            workdir: {
              type: 'string',
              description: 'The working directory to execute the command in',
            },
            timeout_ms: {
              type: 'number',
              description: 'The timeout for the command in milliseconds',
            },
          },
          required: ['command'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'apply_patch',
        description: 'Apply a patch to files in the project. Use the format:\n*** Begin Patch\n*** Update File: path/to/file\n@@ context line\n- removed line\n+ added line\n*** End Patch',
        parameters: {
          type: 'object',
          properties: {
            command: {
              type: 'array',
              items: { type: 'string' },
              description: 'Must be ["apply_patch", "<patch_content>"] where patch_content follows the patch format',
            },
          },
          required: ['command'],
          additionalProperties: false,
        },
      },
    },
  ];
}
