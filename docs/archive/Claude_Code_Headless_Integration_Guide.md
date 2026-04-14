# Claude Code Headless Integration Guide

## Interactive-Equivalent Permission Handling (Actionable Overview)

------------------------------------------------------------------------

# 1. Mental Model

Claude Code has **three separate layers** you must understand:

### A. Tool Availability (`--tools`)

Controls what tools Claude is even allowed to use.

Example:

``` bash
--tools "Read,Edit,Bash"
```

### B. Auto-Approval (`--allowedTools`)

Controls what tools execute **without prompting**.

Example:

``` bash
--allowedTools "Bash(git diff *),Read"
```

### C. Permission Rules (allow / ask / deny)

Defined in settings or enforced via CLI flags. Precedence order:

    deny → ask → allow

------------------------------------------------------------------------

# 2. Interactive vs Headless

| Feature              | Interactive  | Headless (`-p`)                  |
|----------------------|--------------|----------------------------------|
| Conversation context | ✅ Persists  | ✅ With `--resume`               |
| Session approvals    | ✅ In-memory | ❌ Lost on restart               |
| Permission prompts   | Inline       | Must be handled programmatically |

Important: Headless has **no durable session approval cache**.

You must replay approvals manually.

------------------------------------------------------------------------

# 3. Making Headless Equivalent to Interactive

To emulate interactive behavior:

1.  Generate a persistent session ID
2.  Store approvals in memory
3.  Always pass:
    -   `--resume <sessionId>`
    -   `--allowedTools <approval-set>`
4.  Restart process after permission approval

This recreates interactive semantics.

------------------------------------------------------------------------

# 4. Recommended Architecture

## Step 1 – Run Headless

``` bash
claude -p "Your task"   --resume <session-id>   --tools "Read,Edit,Bash"   --permissionMode default   --output-format stream-json
```

## Step 2 – Listen for PermissionRequest event

If detected: - Pause execution - Show UI prompt to user

## Step 3 – User Decision

If approved: - Add narrow rule (example: `Bash(git diff *)`) - Restart
with updated `--allowedTools`

If denied: - Stop session

------------------------------------------------------------------------

# 5. Rule Syntax (Critical)

## Tool-wide approval

    Bash
    Read
    Edit

## Scoped approval

    Bash(git diff *)
    Edit(/src/**)
    Read(./config.json)

## Wildcard Behavior

-   `*` matches arguments
-   `**` recursive paths
-   Space before `*` matters:
    -   `Bash(ls *)` ≠ `Bash(ls*)`

------------------------------------------------------------------------

# 6. Headless Modes

| Mode              | Behavior                                  |
|-------------------|-------------------------------------------|
| default           | Emits PermissionRequest                   |
| dontAsk           | Auto-deny unless pre-approved             |
| acceptEdits       | Auto-approve file edits                   |
| bypassPermissions | Skips all checks (unsafe outside sandbox) |

Recommended for wrappers: - `default` + manual approval - OR `dontAsk` +
fail-fast pattern

------------------------------------------------------------------------

# 7. Best Practices

### 1. Always Use `--resume`

Never rely on `--continue` for production wrappers.

### 2. Persist Approvals in Wrapper State

Example:

``` ts
const approvals = new Set<string>();
```

### 3. Keep Rules Narrow

Prefer:

    Bash(git diff *)

Over:

    Bash

### 4. Use Sandbox for Autonomous Mode

If running fully automated, isolate with: - Docker - VM - Restricted
network

### 5. Add Safety Limits

Always pass:

    --max-turns
    --max-budget-usd

------------------------------------------------------------------------

# 8. When Behavior May Differ

Headless restart may differ if:

-   You kill during long-running commands
-   Commands produce non-deterministic output
-   Side effects occur mid-execution

Otherwise, reasoning continuity is preserved.

------------------------------------------------------------------------

# 9. Decision Matrix

| Use Case                          | Recommended Strategy          |
|-----------------------------------|-------------------------------|
| CI automation                     | `dontAsk` + strict allowlist  |
| Desktop app w/ manual approval    | `default` + replay approvals  |
| Autonomous refactor engine        | Pre-approve + sandbox         |
| Enterprise controlled environment | Managed settings + deny rules |

------------------------------------------------------------------------

# 10. Final Takeaway

Headless mode can behave identically to interactive **if you:** -
Maintain a session ID - Replay approvals - Preserve conversation state -
Handle PermissionRequest events properly

Interactive semantics are process-scoped. Headless semantics are
wrapper-scoped.

Your wrapper becomes the session authority.

------------------------------------------------------------------------

End of Guide.
