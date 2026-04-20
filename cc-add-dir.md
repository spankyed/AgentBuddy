# Add /cc-add-dir command

## Context

Users need a way to add working directories to their Claude Code session from the chat UI. Claude Code's `/add-dir` is REPL-only (interactive UI), but the `--add-dir` CLI flag is already wired through AgentBuddy's chat action. This command adds session-scoped dirs (stored in thread context, passed on every query) with an optional `--remember` flag to persist to `~/.claude/settings.json`.

## Changes

### 1. Extend thread context with `additionalDirs`

**File**: `packages/default-setup/src/actions/claude-code/_helpers/thread-context.ts`

Add `additionalDirs?: string[]` to the `ClaudeCodeThreadState` interface (around line 35).

### 2. Merge stored dirs into every query

**File**: `packages/default-setup/src/actions/claude-code/chat.ts` (~line 275)

After `resolveReferences`, read `additionalDirs` from thread context and merge with reference-derived dirs:

```typescript
const storedDirs = prior?.additionalDirs ?? [];
const allDirs = [...new Set([...storedDirs, ...resolved.addDirs])];

// In the query call:
...(allDirs.length > 0 && { addDir: allDirs }),
```

### 3. Add `handleAddDir` handler + register in map

**File**: `packages/default-setup/src/actions/claude-code/cc-command.ts`

```typescript
async function handleAddDir(
  args: string[],
  services: Services,
  threadId?: string,
): Promise<{ text: string; data?: any }> {
  if (!args.length) return { text: 'Usage: /cc-add-dir <path> [--remember]' };

  const remember = args.includes('--remember');
  const dirPath = args.filter(a => a !== '--remember')[0];
  if (!dirPath) return { text: 'Usage: /cc-add-dir <path> [--remember]' };

  // Session-scoped: store in thread context
  if (threadId) {
    const state = getClaudeState(services, threadId);
    const existing = state?.additionalDirs ?? [];
    if (!existing.includes(dirPath)) {
      persistClaudeState(services, threadId, {
        additionalDirs: [...existing, dirPath],
      });
    }
  }

  // Persistent: write to settings.json
  if (remember) {
    const settings = await services.cli.claudeCode.readSettings();
    const perms = settings.permissions ?? {};
    const dirs: string[] = perms.additionalDirectories ?? [];
    if (!dirs.includes(dirPath)) {
      perms.additionalDirectories = [...dirs, dirPath];
      settings.permissions = perms;
      await services.cli.claudeCode.writeSettings(settings);
    }
  }

  const suffix = remember ? ' (remembered across sessions)' : ' (this session only)';
  return { text: `Added directory: ${dirPath}${suffix}` };
}
```

Register: `'add-dir': handleAddDir` in the handlers map.

Note: `persistClaudeState` is already imported in cc-command.ts (via `getClaudeState` from thread-context). Need to also import `persistClaudeState`.

### 4. Add to library commands doc

**File**: `packages/default-setup/src/library/internal/commands.md`

Add: `**cc-add-dir**: <path> [--remember]`

## Key files

- `packages/default-setup/src/actions/claude-code/_helpers/thread-context.ts` — thread context type
- `packages/default-setup/src/actions/claude-code/chat.ts` — query invocation (merge dirs)
- `packages/default-setup/src/actions/claude-code/cc-command.ts` — new handler
- `packages/default-setup/src/library/internal/commands.md` — command registration

## Verification

1. `/cc-add-dir /some/path` → stores in thread context, next Claude Code turn passes `--add-dir /some/path`
2. `/cc-add-dir /some/path --remember` → also persists to `~/.claude/settings.json`
3. Send a message after adding dir → verify the directory is accessible to Claude Code tools
4. Start a new thread → session-only dirs should NOT carry over; remembered dirs should
