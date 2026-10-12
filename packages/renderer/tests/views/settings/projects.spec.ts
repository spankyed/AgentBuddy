import { afterEach, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, type App } from 'vue';
import type { AppProject } from '@apackdev/sdk/types';
import type { SettingUpdate } from '@apackdev/sdk/fe';
import Projects from '@/views/settings/canvas/components/GeneralSettings/Projects.vue';

// Only the drag adapter is replaced; the project form and its actual inputs run unchanged.
vi.mock('vue-arrange', () => ({
  ArrangeableList: defineComponent({
    inheritAttrs: false,
    props: ['list'],
    setup(props, { slots }) { return () => h('div', (props.list as AppProject[]).map(item => slots.default?.({ item }))); },
  }),
}));

const originalElectron = Object.getOwnPropertyDescriptor(window, 'electronAPI');
let app: App | undefined;
afterEach(() => {
  app?.unmount(); app = undefined; vi.useRealTimers();
  if (originalElectron) Object.defineProperty(window, 'electronAPI', originalElectron);
  else Reflect.deleteProperty(window, 'electronAPI');
});
function render(settings: AppProject[], save = vi.fn()) {
  const el = document.createElement('div');
  app = createApp(Projects, { settings, 'onUpdate-setting': save });
  app.mount(el);
  return el;
}
async function rename(el: HTMLElement) {
  const input = el.querySelector<HTMLInputElement>('input[placeholder="Project name"]')!;
  input.value = 'Edited';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await nextTick();
}

it('edits its own project and directory copies before the parent accepts a save', async () => {
  vi.useFakeTimers();
  const snapshot = [{ name: 'Original', directories: ['/first'], color: 'blue' }];
  const saves = vi.fn();
  const el = render(snapshot, saves);
  await rename(el);
  expect(snapshot[0].name).toBe('Original');
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: { fileUtils: { selectDirectory: vi.fn().mockResolvedValue('/second') } } });
  const add = [...el.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.includes('Add Directory'))!;
  add.click();
  await nextTick();
  vi.advanceTimersByTime(500);
  const update = saves.mock.calls[0][0] as SettingUpdate;
  const value = update.value as AppProject[];
  expect(value[0].name).toBe('Edited');
  expect(value[0].directories).toEqual(['/first', '/second']);
  expect(snapshot[0].directories).toEqual(['/first']);
});

it('renders a restored project missing its directories without mutating the snapshot', () => {
  const legacy = [{ name: 'Restored', color: 'blue' }] as AppProject[];
  const el = render(legacy);
  expect(el.querySelector<HTMLInputElement>('input[placeholder="Project name"]')?.value).toBe('Restored');
  expect(legacy[0]).not.toHaveProperty('directories');
});

it('cancels a pending debounced write when the form is disposed', async () => {
  vi.useFakeTimers();
  const saves = vi.fn();
  await rename(render([{ name: 'Original', directories: [], color: 'blue' }], saves));
  expect(vi.getTimerCount()).toBe(1);
  app?.unmount(); app = undefined;
  expect(vi.getTimerCount()).toBe(0);
  vi.advanceTimersByTime(500);
  expect(saves).not.toHaveBeenCalled();
});
