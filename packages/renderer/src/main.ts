import { createApp } from 'vue'
import { createActor } from 'xstate';
// import { createBrowserInspector } from '@statelyai/inspect';
import type { Actor } from 'xstate';
import App from './App.vue'
import './style.css'
import plugins, { defaultPlugin } from '@/plugins';
import { application, createApplicationState } from '@/core/actors/application';
import { runFrontendMigrations } from '@/setup/migrations';

declare const __APP_VERSION__: string;

declare global {
  interface Window {
    applicationState: Actor<ReturnType<typeof createApplicationState>>;
    __showErrorPage?: (title: string, detail: string) => void;
    appVersion: string;
  }
}

function serializeRendererError(error: unknown): { message: string; stack?: string; meta?: unknown } {
  if (error instanceof Error) {
    return {
      message: error.message || error.toString(),
      stack: error.stack,
    };
  }

  if (typeof error === 'string') {
    return { message: error };
  }

  try {
    return {
      message: JSON.stringify(error),
      meta: error,
    };
  } catch {
    return { message: String(error) };
  }
}

function reportRendererError(source: string, error: unknown, meta?: unknown) {
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

// --- Pre-actor initialization ---
window.appVersion = __APP_VERSION__;
console.log(`AgentBuddy v${__APP_VERSION__}`);
runFrontendMigrations();

// const { inspect } = createBrowserInspector();

export const applicationState = createActor(createApplicationState(), {
  systemId: application,
  // inspect,
  input: {
    defaultPlugin,
    plugins,
  }
}).start();

window.applicationState = applicationState;

applicationState.subscribe({
  error: (error: unknown) => {
    console.error('Application State Error:', error);
    reportRendererError('application-state', error);
    window.__showErrorPage?.(
      'Something went wrong',
      error instanceof Error ? error.stack || error.message : String(error)
    );
  }
});

const app = createApp(App);

app.config.errorHandler = (err, _instance, info) => {
  console.error('Vue error:', err, info);
  reportRendererError('vue', err, { info });
  window.__showErrorPage?.(
    'Something went wrong',
    err instanceof Error ? err.stack || err.message : String(err)
  );
};

app.mount('#app');
