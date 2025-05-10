import type { Actor } from 'xstate';
import { createActor } from 'xstate';
import { createBrowserInspector } from '@statelyai/inspect';
import logErrors from '@/helpers/log-errors';
import plugins, { defaultPlugin } from '@/plugins';
import { createApplicationState } from '@/state/app-state';
import { createApp } from 'vue'
import App from './app.vue'
import './style.css'

const { inspect } = createBrowserInspector();

declare global {
  interface Window {
    applicationActor: Actor<ReturnType<typeof createApplicationState>>;
  }
}

const applicationMachine = createApplicationState();

export const applicationActor = createActor(applicationMachine, {
  systemId: 'application',
  inspect,
  input: {
    defaultPlugin,
    plugins,
  }
}).start();

applicationActor.subscribe(logErrors('Application'));

window.applicationActor = applicationActor;

createApp(App).mount('#root')
