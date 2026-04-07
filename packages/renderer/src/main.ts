import { createApp } from 'vue'
import { createActor } from 'xstate';
// import { createBrowserInspector } from '@statelyai/inspect';
import type { Actor } from 'xstate';
import App from './App.vue'
import './style.css'
import plugins, { defaultPlugin } from '@/plugins';
import { application, createApplicationState } from '@/core/actors/application';
import { runFrontendMigrations } from '@/setup/migrations';

// Run localStorage migrations before actor creation (keys are read during context init)
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

applicationState.subscribe({
  error: (error: unknown) => {
    console.error('Application State Error:', error);
    window.__showErrorPage?.(
      'Something went wrong',
      error instanceof Error ? error.stack || error.message : String(error)
    );
  }
});

declare global {
  interface Window {
    applicationState: Actor<ReturnType<typeof createApplicationState>>;
    __showErrorPage?: (title: string, detail: string) => void;
  }
}

window.applicationState = applicationState;

const app = createApp(App);

app.config.errorHandler = (err, _instance, info) => {
  console.error('Vue error:', err, info);
  window.__showErrorPage?.(
    'Something went wrong',
    err instanceof Error ? err.stack || err.message : String(err)
  );
};

app.mount('#app');
