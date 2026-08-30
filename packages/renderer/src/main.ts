import { createApp } from 'vue'
import { createActor } from 'xstate';
// import { createBrowserInspector } from '@statelyai/inspect';
import type { Actor } from 'xstate';
import App from './App.vue'
import './style.css'
import plugins, { defaultPlugin } from '@/plugins';
import { application, createApplicationState } from '@/core/actors/application';
import { runFrontendMigrations } from '@/setup/migrations';
import { trpc } from '@/core/trpc';
import { handleProtocolInstall, requestPackInstall } from '@/core/packs/pack-install';
import { loadPackPlugins } from '@/core/packs/pack-loader';
import '@/core/packs/host-deps';

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

const query = new URLSearchParams(window.location.search);
const isPluginPopout = query.get('popout') === 'plugin';
const initialPluginId = isPluginPopout ? query.get('pluginId') ?? undefined : undefined;

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
    initialPluginId,
    restoreLastActivePlugin: !isPluginPopout,
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

// Listen for deep link protocol actions (abuddy://install?pack=...)
window.electronAPI?.protocolAction?.onAction(({ action, params }) => {
  if (action === 'install') {
    const request = handleProtocolInstall(params);
    if (request) {
      requestPackInstall(request);
    }
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

app.provide('actorSystem', applicationState.system);
app.mount('#app');

// Load external pack plugins after boot
trpc.packs.registry.query().then(async (registry) => {
  if (!registry.length) return;
  for (const pack of registry) {
    if (!pack.plugins.length) continue;
    const plugins = await loadPackPlugins(
      pack.plugins.map(p => ({ id: p.id, entry: p.entry, label: p.label, icon: p.icon })),
      `pack://${pack.id}`,
    );
    if (plugins.length > 0) {
      applicationState.send({ type: 'PACK_PLUGINS_LOADED', plugins });
    }
  }
}).catch(err => {
  console.warn('[pack-loader] Failed to load pack registry:', err);
});
