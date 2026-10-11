// Monaco's diff view throws an internal range-validation error that it recovers from on its own. The
// app reports every uncaught renderer error as fatal, so unless this filter is registered *before* that
// reporter, the reporter runs first — listeners on one target fire in registration order, and the
// capture flag does not change that for an event dispatched at the target itself.
//
// It therefore lives in its own module rather than in UnifiedMonacoEditor.vue, where it installed on
// the first editor's setup and so always lost the race: the app's composition root
// (`renderer/src/main.ts`) calls this before adding its own listener, and the editor calls it too, so a
// pack that mounts the editor in a host that forgot is still covered.
let installed = false;

/** Stops Monaco's recoverable diff-range error from reaching a global error handler. Safe to call repeatedly. */
export function installMonacoErrorFilters(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const isRecoverableDiffError = (message: string | undefined): boolean =>
    message?.includes('cannot be after endLineNumberExclusive') ?? false;

  window.addEventListener('error', (event) => {
    if (isRecoverableDiffError(event.error?.message)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  });
  window.addEventListener('unhandledrejection', (event) => {
    if (isRecoverableDiffError(event.reason?.message ?? String(event.reason))) event.preventDefault();
  });
}
