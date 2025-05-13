import type { Actor } from 'xstate';
import { createActor } from 'xstate';
import { createBrowserInspector } from '@statelyai/inspect';
import logErrors from '@/shared/log-errors';
import plugins, { defaultPlugin } from '@/plugins';
import { createApplicationState } from '@/actors/app-state';
import { createApp } from 'vue'
import App from './App.vue'
import './style.css'

const { inspect } = createBrowserInspector();

export const applicationActor = createActor(createApplicationState(), {
  systemId: 'application',
  inspect,
  input: {
    defaultPlugin,
    plugins,
  }
}).start();

applicationActor.subscribe(logErrors('Application'));

createApp(App).mount('#root')

declare global {
  interface Window {
    applicationActor: Actor<ReturnType<typeof createApplicationState>>;
  }
}

window.applicationActor = applicationActor;
