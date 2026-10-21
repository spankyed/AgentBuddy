# Live frontend reload did not pick up a source edit on Linux

**Status:** resolved 2026-10-21. A defect in the test, not in the live frontend: pack development on Linux was not
affected.

## Symptom

`frontend-generation.native.spec.ts` — `refreshes backend and live frontend together, retains failed incumbents and
awaits retirement` — edits `src/View.vue` and asks the retained Vite worker for the component's template. On Linux
the template kept its old text however long the case waited. macOS passed.

## Cause

Vite saw the edit on Linux (`hmr update /src/View.vue`), and the template it served afterwards carried the old
file in its source map. `@vitejs/plugin-vue` keeps each component's parsed form in a cache keyed by filename: the
main module (`/src/View.vue`) re-reads the file and refreshes that cache, and the template module
(`?vue&type=template`) compiles from whatever the cache holds. The case fetched the template alone, polling, so it
was compiled from the stale entry, and Vite then kept that result until the next edit. When the case was made to
fetch the main module first, it passed one run in two: a retry whose main fetch was answered just before Vite
invalidated it could still compile the template stale.

A browser cannot meet either: Vite sends its HMR message only after invalidating, and the browser then re-imports
the component before its template. Why macOS passed was not measured; its temporary directory sits behind the
`/var` → `/private/var` link, which is consistent with the plugin's cache missing and the file being read fresh.

## Fix

The case does what a browser does: it listens on Vite's HMR socket (token from the served `/@vite/client`), waits
for the update or reload for `/src/View.vue`, then fetches the main module before the template. It now runs on
Linux, passing three consecutive runs in the test container. Two assertions that expected a released compiler
installation to be deleted, from before installations moved to the shared store, now expect it to remain.
