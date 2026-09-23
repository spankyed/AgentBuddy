// This window's global error handling: every uncaught error is reported to the main process as fatal,
// except the one Monaco's diff view recovers from on its own. The filter has to be registered before the
// reporter — listeners on one target fire in registration order, and the capture flag doesn't change that
// for an event dispatched at the target itself — so both are installed by one call here, rather than in an
// order that main.ts has to keep. The filter's own module says why it can't live in the editor component.
import { installMonacoErrorFilters } from '@abuddy/ui/components/monaco-error-filters';

/** A thrown value as the log takes it: an Error's message and stack, a string as itself, anything else as JSON */
export function serializeRendererError(error: unknown): { message: string; stack?: string; meta?: unknown } {
  if (error instanceof Error) {
    return { message: error.message || error.toString(), stack: error.stack };
  }

  if (typeof error === 'string') {
    return { message: error };
  }

  try {
    return { message: JSON.stringify(error), meta: error };
  } catch {
    return { message: String(error) };
  }
}

/** Reports an error to the main process's renderer log. A log that can't be written is dropped, not thrown. */
export function reportRendererError(source: string, error: unknown, meta?: unknown): void {
  const serialized = serializeRendererError(error);
  window.electronAPI?.rendererLog?.write({
    level: 'error',
    source,
    message: serialized.message,
    stack: serialized.stack,
    meta: {
      startupId: window.electronAPI?.startupId,
      detail: meta ?? serialized.meta,
    },
    fatal: true,
  }).catch(() => {});
}

/** Installs the Monaco filter and this window's error listeners, in that order. Called once, from main.ts. */
export function installGlobalErrorHandling(): void {
  installMonacoErrorFilters();

  window.addEventListener('error', (event) => {
    reportRendererError('window.error', event.error ?? event.message, {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    reportRendererError('window.unhandledrejection', event.reason);
  });
}
