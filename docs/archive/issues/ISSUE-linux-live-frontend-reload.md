# Live frontend reload does not pick up a source edit on Linux

**Status:** open. Found 2026-10-21, the first time `frontend-generation.native.spec.ts` ran on Linux (the Linux
test container; CI's `compiler_linux` job runs a fixed list that does not include it).

## Reproduction

```bash
npm run test:linux -- npx vitest run --config vitest.native.config.ts --project @apackdev/cli \
  packages/apack-cli/tests/build/frontend-generation.native.spec.ts
```

`refreshes backend and live frontend together, retains failed incumbents and awaits retirement` serves the first
generation (`GENERATION_A`), then edits `src/View.vue` and waits for the retained Vite worker to serve the edited
template (`GENERATION_A_SECOND`). On Linux it never does: the same stale transform comes back after 2s, and after
20s when the wait is widened. macOS passes it in the strict gate's native jobs.

## What is known

- Not a timing margin: widening the wait tenfold changes nothing.
- The frontend watcher itself works on Linux: `frontend-watch.native.spec.ts` passes in the same container.
- So the gap is between the edit and the retained Vite worker's module graph — its file view, its watcher, or
  how the captured worker sees live Vue sources on Linux.

## Meanwhile

The case skips on Linux, naming this file. Pack development is supported on macOS, where it passes.
