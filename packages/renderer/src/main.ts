import { createApp } from 'vue'
import { createActor } from 'xstate';
// import { createBrowserInspector } from '@statelyai/inspect';
import type { Actor } from 'xstate';
import App from './App.vue'
import './style.css'
import builtInPacks from 'virtual:built-in-packs';
import { getRegisteredPlugins, getRegisteredDefaultPlugin, registerPackFE } from '@abuddy/sdk/fe';
import { packsPlugin } from '@/core/packs/plugin';
import { application, createApplicationState } from '@/core/actors/application';
import { runFrontendMigrations } from '@/setup/migrations';
import { trpc } from '@/core/trpc';
import { handleProtocolInstall, requestPackInstall } from '@/core/packs/pack-install';
import { loadPackPlugins, loadPackFEEntry, loadPackStyles } from '@/core/packs/pack-loader';
import '@/core/packs/host-deps';
import { registerHostModule } from '@abuddy/sdk/runtime';

declare const __APP_VERSION__: string;

declare global {
  interface Window {
    applicationState: Actor<ReturnType<typeof createApplicationState>>;
    __showErrorPage?: (title: string, detail: string) => void;
    __disableOnboardingUI?: () => void;
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

for (const [packId, loader] of Object.entries(builtInPacks)) {
  try {
    const mod = await loader();
    if (mod.default) registerPackFE(mod.default);
  } catch (err) {
    console.error(`[boot] Failed to load built-in pack ${packId}:`, err);
  }
}

// const { inspect } = createBrowserInspector();

const plugins = [...getRegisteredPlugins(), packsPlugin];
const defaultPlugin = getRegisteredDefaultPlugin();

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

window.__disableOnboardingUI = () => {
  applicationState.send({ type: 'ONBOARDING_COMPLETE' });
  console.log('Onboarding UI hiding disabled');
};

registerHostModule('application', applicationState);

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
app.provide('applicationActor', applicationState);
app.mount('#app');

// Load external pack FE contributions after boot
trpc.packs.registry.query().then(async (registry) => {
  const externalPacks = registry.filter(p => !p.builtIn);
  if (!externalPacks.length) return;
  for (const pack of externalPacks) {
    const packBaseUrl = `pack://${pack.id}`;

    if (pack.feStyles) {
      await loadPackStyles(pack.id, pack.feStyles, packBaseUrl);
    }

    if (pack.feEntry) {
      const registration = await loadPackFEEntry(pack.feEntry, packBaseUrl);
      if (registration) {
        registerPackFE(registration);
        const plugins = registration.plugins ?? [];
        if (plugins.length > 0) {
          applicationState.send({ type: 'PACK_PLUGINS_LOADED', plugins });
        }
      }
      continue;
    }

    if (!pack.plugins.length) continue;
    const plugins = await loadPackPlugins(
      pack.plugins.map(p => ({ id: p.id, entry: p.entry, label: p.label, icon: p.icon })),
      packBaseUrl,
    );
    if (plugins.length > 0) {
      registerPackFE({ plugins });
      applicationState.send({ type: 'PACK_PLUGINS_LOADED', plugins });
    }
  }
}).catch(err => {
  console.warn('[pack-loader] Failed to load pack registry:', err);
});
