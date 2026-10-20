import { afterEach, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, type App } from 'vue';
import type { PluginNavigationItem } from '@apackdev/host/fe';
import { resolveName } from '@apackdev/sdk/ids';
import Toolbar from '@/views/layout/Toolbar.vue';

vi.mock('@/main', () => ({ applicationState: { send: vi.fn() } }));
vi.mock('@/views/layout/WindowControls.vue', () => ({ default: defineComponent({ render: () => null }) }));
vi.mock('@/views/layout/ToolbarPluginContextMenu.vue', () => ({ default: defineComponent({ render: () => null }) }));
let app: App | undefined;
afterEach(() => { app?.unmount(); app = undefined; });

it('selects a loaded tab and opens an unloaded one through the shell, dimmed and labelled as not loaded', async () => {
  const plugins: PluginNavigationItem[] = [
    { id: resolveName('view', 'alpha'), label: 'Alpha', visible: true, loaded: true },
    { id: resolveName('view', 'beta'), label: 'Beta', visible: true, loaded: false },
  ];
  const selected = vi.fn();
  const opened = vi.fn();
  const el = document.createElement('div');
  app = createApp(defineComponent({ setup: () => () => h(Toolbar, {
    plugins, activePlugin: { id: 'alpha/view' } as never, onSelectPlugin: selected, onOpenPlugin: opened,
  }) }));
  app.mount(el);
  await nextTick();
  const button = (id: string) => el.querySelector<HTMLButtonElement>(`[data-onboarding-id="plugin-${id}"]`)!;
  expect(button('beta/view').title).toBe('Beta (not loaded yet)');
  expect(button('beta/view').className).toContain('opacity-50');
  expect(button('alpha/view').className).not.toContain('opacity-50');
  button('alpha/view').click();
  button('beta/view').click();
  expect(selected.mock.calls).toEqual([['alpha/view']]);
  expect(opened.mock.calls).toEqual([['beta/view']]);
});
