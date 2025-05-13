import type { Actor } from 'xstate';
import { createActor } from 'xstate';
import { createBrowserInspector } from '@statelyai/inspect';
import logErrors from '@/shared/log-errors';
import plugins, { defaultPlugin } from '@/plugins';
import { createApplicationState } from '@/actors/app-state';
import { createApp } from 'vue'
import './style.css'
import App from './App.vue';

const { inspect } = createBrowserInspector();

export const applicationState = createActor(createApplicationState(), {
  systemId: 'application',
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
