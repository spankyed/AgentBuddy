# PR Panel Top Row Regression

## Symptoms
1. **PR selector hidden on sibling branches** — When viewing a PR from a branch other than the current one, the PR selector dropdown disappeared entirely. Only the back button and View button were visible, side by side.
2. **Checking spinner and PR selector rendered simultaneously** — On navigation back or refresh, the "Checking..." spinner and the PR selector appeared side by side instead of being mutually exclusive.

## Root Cause

**Commit:** `0a9edab0` — *fix: move "Back to current branch" button to left of PR selector*
**Date:** 2026-04-09
**File:** `packages/renderer/src/plugins/code/features/pull-request/PullRequestPanel.vue`

The commit moved the back button from its original position (after the action buttons, on the right side) to directly above the PRSelector. The PRSelector already had `v-else` on it (paired with the checking spinner's `v-if`). By inserting a `v-if="isViewingOtherPR"` button between the checking spinner and the PRSelector, the `v-else` on PRSelector became paired with the back button's `v-if` instead of the checking spinner's `v-if`.

This caused two breakages:
- **Back button and PRSelector became mutually exclusive** — showing the back button hid the selector.
- **Checking spinner lost its v-else pairing** — the spinner and the back/selector block could render at the same time.

### Before (working)
```
v-if="checking"    → spinner
PRSelector v-else  → selector (mutually exclusive with spinner)
v-if="otherPR"     → back button (after selector, independent)
```

### After commit 0a9edab0 (broken)
```
v-if="checking"    → spinner (orphaned, no v-else pair)
v-if="otherPR"     → back button
PRSelector v-else  → selector (now paired with back button, not spinner)
```

## Fix
Wrapped the back button and PRSelector together inside a `<template v-else>` block so they are mutually exclusive with the checking spinner, while the back button uses an independent `v-if` inside the template so it coexists with the PRSelector.

```
v-if="checking"       → spinner
<template v-else>     → mutually exclusive with spinner
  v-if="otherPR"      → back button (independent, doesn't hide selector)
  PRSelector           → always shown when not checking
</template>
```
