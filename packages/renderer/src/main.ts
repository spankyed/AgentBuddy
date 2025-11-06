import { createApp } from 'vue'
import { createActor } from 'xstate';
// import { createBrowserInspector } from '@statelyai/inspect';
import type { Actor } from 'xstate';
import App from './App.vue'
import './style.css'
import logErrors from '@/core/log-errors';
import plugins, { defaultPlugin } from '@/plugins';
import { application, createApplicationState } from '@/core/actors/application';

// const { inspect } = createBrowserInspector();

export const applicationState = createActor(createApplicationState(), {
  systemId: application,
  // inspect,
  input: {
    defaultPlugin,
    plugins,
  }
}).start();

applicationState.subscribe(logErrors('Application'));

declare global {
  interface Window {
    applicationState: Actor<ReturnType<typeof createApplicationState>>;
  }
}

window.applicationState = applicationState;

createApp(App).mount('#app')
