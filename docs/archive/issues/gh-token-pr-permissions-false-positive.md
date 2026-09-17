# Issue: "GitHub token missing PR permissions" False Positive After Release

**Date:** 2026-04-08
**Severity:** Low — PR panel shows misleading warning, PR features still work if token is correct
**Affected:** v0.1.0 release, any user with multiple `gh` auth accounts or non-permission probe failures
**Introduced in:** commit `1720435e` — "feat: detect GitHub token permission issues early with actionable warnings"

## Symptom

After upgrading to the latest release, the PR panel displays a yellow warning banner:

> GitHub token missing PR permissions. Run `gh auth refresh -s repo` or update your fine-grained token settings.

Running `gh auth refresh -s repo` does not resolve the warning.

## Investigation

### 1. The detection feature is new

Commit `1720435e` (Apr 7) added a GraphQL probe to `checkAuth()` that tests whether the active token can access `pullRequests`. Before this commit, there was no proactive warning — PR operations would just fail silently.

### 2. The probe has an overly broad catch

```typescript
// packages/api/src/systems/code/services/gh-cli.ts — checkAuth()
try {
  const { owner, name } = await getRepoInfo(cwd)
  await runGh([...graphql probe...], cwd, 10_000)
  return { available: true, prAccess: true }
} catch {
  return { available: true, prAccess: false }  // ← catches EVERYTHING
}
```

The bare `catch` treats **any** error as a permission failure: network timeouts, DNS issues, `getRepoInfo()` failures (no GitHub remote), rate limiting, and macOS Keychain access prompts that block `gh` commands.

### 3. The banner suggestion is wrong for multi-account setups

The user had two `gh` auth accounts:

```
✓ Logged in to github.com (GITHUB_TOKEN)  ← ACTIVE — fine-grained PAT, no PR scope
✓ Logged in to github.com (keyring)       ← INACTIVE — OAuth token with repo scope
```

`gh auth refresh -s repo` refreshes the **keyring** token (inactive), but `GITHUB_TOKEN` env var takes precedence. The banner's suggestion cannot work in this scenario.

### 4. macOS Keychain prompts compound the issue

After the release, macOS Keychain re-authorization prompts (`git-credential-osxkeychain wants to use your confidential information...`) appeared repeatedly because the new Electron binary signature was untrusted. Each `gh` command spawned by the app triggered a Keychain prompt, which — if unanswered — caused the command to hang and timeout.

## Root Cause

Two distinct issues:

1. **Code:** The `checkAuth()` GraphQL probe's bare `catch` treats all errors (timeouts, network, Keychain blocks) as permission failures, producing false positives.

2. **User environment:** The active `gh` token was a fine-grained PAT (from `GITHUB_TOKEN` env var) that genuinely lacked PR permissions. The banner's suggested fix (`gh auth refresh -s repo`) refreshes the wrong token.

## Fix

### Code changes

**`packages/api/src/systems/code/services/gh-cli.ts`:**

1. Narrow the `checkAuth()` catch block to only return `prAccess: false` for actual permission errors (`'missing required permissions'` or `'Resource not accessible'`). All other errors return `prAccess: true` (benefit of the doubt — actual PR operations will surface their own errors).

2. Update the `runGh` permission error message (line 29) to suggest `gh auth status` and `gh auth switch` instead of `gh auth refresh -s repo`.

3. Add `createLogger('gh-cli')` logging to the probe catch block for future debugging.

**`packages/renderer/src/plugins/code/features/pull-request/PullRequestPanel.vue`:**

4. Update the banner text to suggest checking active token via `gh auth status` and switching accounts with `gh auth switch`.

### User-facing resolution

- **Multi-account:** Run `gh auth status` to identify the active token, then either update its permissions or run `gh auth switch` to use a token with `repo` scope.
- **Keychain prompts:** Click "Always Allow" on the macOS Keychain prompt to permanently authorize the new app binary.
- **Fine-grained PAT:** Add "Pull requests: Read" permission in GitHub token settings.

## Lessons

- Proactive permission detection is valuable, but the error path must distinguish between "no permission" and "couldn't check" — a bare `catch` conflates both.
- Banner suggestions should account for `GITHUB_TOKEN` env var overriding keyring auth. Always point users to `gh auth status` first.
- Electron app upgrades change binary signatures, triggering macOS Keychain re-authorization. Consider documenting this as a known post-upgrade step.
