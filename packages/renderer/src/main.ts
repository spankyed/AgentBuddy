import { createApp } from 'vue'
import { createActor } from 'xstate';
// import { createBrowserInspector } from '@statelyai/inspect';
import type { Actor } from 'xstate';
import App from './views/App.vue'
import './style.css'
// highlight.js's stylesheet is global (.hljs, pre code.hljs), so the app owns it: imported from
// @abuddy/ui it would ship again inside every fe.bundleUi pack and restyle code everywhere.
import 'highlight.js/styles/github-dark.css'
import builtInPacks from 'virtual:built-in-packs';
import { hostFrontend } from '@/views/packs/plugin';
import { createAppShell } from '@/runtime/shell';
import { HOST, installFromProtocol, runFrontendMigrations } from '@abuddy/host/fe';
import 'virtual:host-deps';
import { bindRendererHost } from '@/runtime';
import { fePacks } from '@/runtime/packs';
import { installGlobalErrorHandling, reportRendererError } from '@/boot/errors';

declare const __APP_VERSION__: string;

declare global {
  interface Window {
    applicationState: Actor<ReturnType<typeof createAppShell>>;
    __disableOnboardingUI?: () => void;
    appVersion: string;
  }
}

installGlobalErrorHandling();

const query = new URLSearchParams(window.location.search);
const isPluginPopout = query.get('popout') === 'plugin';
const initialPluginId = isPluginPopout ? query.get('pluginId') ?? undefined : undefined;

// --- Pre-actor initialization ---
window.appVersion = __APP_VERSION__;
console.log(`AgentBuddy v${__APP_VERSION__}`);
runFrontendMigrations(localStorage, __APP_VERSION__);

const packEntries = Object.entries(builtInPacks);
const loadedMods = await Promise.all(
  packEntries.map(async ([packId, loader]) => {
    try { return await loader(); }
    catch (err) { console.error(`[boot] Failed to load built-in pack ${packId}:`, err); return null; }
  })
);
for (const mod of loadedMods) {
  if (mod?.default) fePacks.registerPackFE(mod.default);
}

// const { inspect } = createBrowserInspector();

fePacks.registerPackFE(hostFrontend);

// The SDK's frontend code (lookups, navigation, sends, the secrets client) reaches this window's app from here on:
// bound before the application actor is created, since creating it builds its plugins' state, and before any
// external pack frontend loads
let createdApplication: typeof applicationState | undefined;
bindRendererHost(() => createdApplication);

// The shell starts with the plugins registered above, its default the one a pack claims
export const applicationState = createActor(createAppShell(), {
  systemId: HOST.application,
  // inspect,
  input: {
    initialPluginId,
    ownsLastActivePlugin: !isPluginPopout,
  }
});

createdApplication = applicationState;
applicationState.start();

window.applicationState = applicationState;

window.__disableOnboardingUI = () => {
  applicationState.send({ type: 'ONBOARDING_COMPLETE' });
  console.log('Onboarding UI hiding disabled');
};

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
  if (action === 'install') installFromProtocol(params);
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

window.electronAPI?.rendererReady?.();

// External pack FE extensions load from the application actor, each time this window's bus
// subscription is established: a failed query is retried on the next connection.
