import type { Actor } from 'xstate';
import { createActor } from 'xstate';
import { createBrowserInspector } from '@statelyai/inspect';
import logErrors from '@/core/log-errors';
import plugins, { defaultPlugin } from '@/plugins';
import { application, createApplicationState } from '@/core/actors/application';
import { createApp } from 'vue'
import './style.css'
import App from './app.vue';

const { inspect } = createBrowserInspector();

export const applicationState = createActor(createApplicationState(), {
  systemId: application,
  inspect,
  input: {
    defaultPlugin,
    plugins,
  }
}).start();

applicationState.subscribe(logErrors('Application'));

createApp(App).mount('#root')

declare global {
  interface Window {
    applicationState: Actor<ReturnType<typeof createApplicationState>>;
  }
}

window.applicationState = applicationState;
