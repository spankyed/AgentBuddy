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

// --- Pre-actor initialization ---
window.appVersion = __APP_VERSION__;
console.log(`AgentBuddy v${__APP_VERSION__}`);
runFrontendMigrations();
const demoConfig = window.electronAPI?.demo;
if (demoConfig?.enabled) {
  localStorage.setItem('agentbuddy-last-active-plugin', 'threads');
  localStorage.setItem('threads-view-preference', 'dashboard');
}

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
    window.__showErrorPage?.(
      'Something went wrong',
      error instanceof Error ? error.stack || error.message : String(error)
    );
  }
});

const app = createApp(App);

app.config.errorHandler = (err, _instance, info) => {
  console.error('Vue error:', err, info);
  window.__showErrorPage?.(
    'Something went wrong',
    err instanceof Error ? err.stack || err.message : String(err)
  );
};

app.mount('#app');

if (demoConfig?.enabled) {
  import('./demo/apply-demo-scene')
    .then(({applyDemoScene}) => applyDemoScene(demoConfig as any))
    .catch((error) => {
      console.error('Demo scene hydration failed:', error);
      window.__showErrorPage?.(
        'Demo scene hydration failed',
        error instanceof Error ? error.stack || error.message : String(error),
      );
    });
}
