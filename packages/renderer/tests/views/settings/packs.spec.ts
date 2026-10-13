import { afterEach, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, ref, shallowRef, type App } from 'vue';
import type { SettingsSnapshot } from '@apackdev/sdk/types';

const { update, reset, send } = vi.hoisted(() => ({ update: vi.fn(), reset: vi.fn(), send: vi.fn() }));
vi.mock('@apackdev/sdk/fe', async importOriginal => ({
  ...await importOriginal<typeof import('@apackdev/sdk/fe')>(),
  usePlugin: () => ({ send }),
}));
vi.mock('@/views/settings/save', () => ({ useSettingsSaveStatus: () => ({
  saveStatus: ref('idle'), problems: ref([]), updateSettings: update, resetSettings: reset,
}) }));
vi.mock('@/runtime/settings', () => ({ useWindowSettingsSnapshot: () => snapshot }));
import { fePacks } from '@/runtime/packs';
import PacksTab from '@/views/settings/canvas/tabs/PacksTab.vue';

const definition = { title: 'Preferences', schema: { type: 'object' }, defaults: { name: 'Default' } };
const snapshot = shallowRef<SettingsSnapshot>({
  runId: 'forms', revision: 0, status: 'ready',
  values: { app: { hotkeys: {}, personal: {}, projects: [] }, packs: { first: { preferences: { name: 'First' } }, second: { preferences: { name: 'Second' } } }, features: {} },
  catalog: { revision: 0, app: { schema: { type: 'object' }, defaults: {} },
    packs: { first: { preferences: definition }, second: { preferences: definition } }, features: {}, dependencies: {} },
});
let app: App | undefined;
afterEach(() => {
  app?.unmount(); app = undefined;
  fePacks.unregisterPackFE('first'); fePacks.unregisterPackFE('second');
  vi.clearAllMocks();
});
function render() {
  const el = document.createElement('div');
  app = createApp(PacksTab); app.mount(el); return el;
}
const form = defineComponent({
  props: ['settings'], emits: ['update-setting'],
  setup(props, { emit }) {
    return () => h('button', { 'data-form': '', onClick: () => emit('update-setting', {
      path: ['name'], value: 'Edited', target: { kind: 'app' },
    }) }, props.settings.name);
  },
});

it('keeps inactive declarations editable in JSON and reacts to form registration and unload', async () => {
  const el = render();
  expect(el.textContent).toContain('first/preferences');
  expect(el.textContent).toContain('second/preferences');
  expect(el.textContent).toContain('Edit in JSON');
  const json = [...el.querySelectorAll('button')].find(button => button.textContent === 'Edit in JSON')!;
  json.click();
  expect(send.mock.calls.map(([event]) => event)).toEqual([
    { type: 'TAB.SELECT', tab: 'general' }, { type: 'GENERAL_NAV.SELECT', item: 'json' },
  ]);
  fePacks.registerPackFE({ id: 'first', settingsForms: { preferences: form } });
  await nextTick();
  expect(el.querySelector('[data-form]')?.textContent).toBe('First');
  fePacks.unregisterPackFE('first'); await nextTick();
  expect(el.querySelector('[data-form]')).toBeNull();
  expect(el.textContent).toContain('Edit in JSON');
});

it('uses the selected qualified owner even when a form emits a different target', async () => {
  fePacks.registerPackFE({ id: 'first', settingsForms: { preferences: form } });
  fePacks.registerPackFE({ id: 'second', settingsForms: { preferences: form } });
  const el = render();
  [...el.querySelectorAll('button')].find(button => button.textContent?.includes('second/preferences'))!.click();
  await nextTick();
  expect(el.querySelector('[data-form]')?.textContent).toBe('Second');
  el.querySelector<HTMLButtonElement>('[data-form]')!.click();
  expect(update).toHaveBeenCalledWith({
    target: { kind: 'pack', packId: 'second', groupId: 'preferences' },
    path: ['name'], value: 'Edited', condition: undefined,
  });
});
