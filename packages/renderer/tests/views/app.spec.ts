// The welcome overlay a pack contributes, which this window has to draw on the one boot it is meant for.
//
// `App.vue` mounts before any pack's frontend has loaded — `main.ts` registers none, the shell loads every one,
// the app's own included, once the bus says which packs are running — and the overlay is shown while the shell
// has the `welcome` tag, which is that same window. So reading the slot once at setup drew nothing for a pack
// that contributes one.
//
// Mocked here: `@/main`, which is the window's boot, and the two sibling views, which this case is not about.
// The registry is the real one (`@/runtime/packs`), and the pack registers through it as the loader does.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, type App as VueApp } from 'vue';
import { fePacks } from '@/runtime/packs';
import App from '@/views/App.vue';

// The shell as this window sees it during onboarding: a real actor, so `useSelector` and `hasTag` are the real
// ones. Built inside the factory because a `vi.mock` factory is hoisted above the module body.
vi.mock('@/main', async () => {
  const { createActor, createMachine } = await import('xstate');
  const shell = createActor(createMachine({ id: 'shell', initial: 'onboarding', states: { onboarding: { tags: 'welcome' } } }));
  shell.start();
  return { applicationState: shell };
});
vi.mock('@/views/WebApp.vue', () => ({ default: defineComponent({ render: () => h('div', { class: 'web-app' }) }) }));
vi.mock('@/views/PluginPopoutApp.vue', () => ({ default: defineComponent({ render: () => h('div', { class: 'popout' }) }) }));

const Welcome = defineComponent({ render: () => h('div', { class: 'pack-welcome' }, 'Hello') });

let app: VueApp | undefined;
let el: HTMLElement;

function render(): HTMLElement {
  el = document.createElement('div');
  app = createApp(App);
  app.mount(el);
  return el;
}

/**
 * Past the microtask the registry defers its notification to, and then past Vue's render flush. A single
 * `nextTick()` is not enough: the notification is queued before the test resumes, so the ref it sets queues
 * the render job behind this continuation.
 */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => { el = document.createElement('div'); });
afterEach(() => {
  app?.unmount();
  app = undefined;
  fePacks.unregisterPackFE('welcome-pack');
});

describe('the welcome overlay a pack contributes', () => {
  it('is drawn once the pack registers, having mounted before it', async () => {
    const mounted = render();
    expect(mounted.querySelector('.pack-welcome')).toBeNull();

    fePacks.registerPackFE({ id: 'welcome-pack', appExtensions: { welcome: Welcome } });
    await settle();

    expect(mounted.querySelector('.pack-welcome')).not.toBeNull();
  });

  it('goes again when the pack unregisters', async () => {
    fePacks.registerPackFE({ id: 'welcome-pack', appExtensions: { welcome: Welcome } });
    const mounted = render();
    expect(mounted.querySelector('.pack-welcome')).not.toBeNull();

    fePacks.unregisterPackFE('welcome-pack');
    await settle();

    expect(mounted.querySelector('.pack-welcome')).toBeNull();
  });
});
