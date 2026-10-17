import { afterEach, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, ref, type App } from 'vue';
import type { AppPersonalInfo, SettingUpdate } from '@apackdev/sdk/types';
import PersonalInfo from '@/views/settings/canvas/components/GeneralSettings/PersonalInfo.vue';

vi.mock('@/runtime/settings', () => ({ useWindowSettingsSnapshot: () => ref({ runId: 'personal-run' }) }));

let app: App | undefined;
afterEach(() => { app?.unmount(); app = undefined; vi.useRealTimers(); });

function render(value: AppPersonalInfo) {
  const settings = ref(value);
  const saved = vi.fn();
  const el = document.createElement('div');
  app = createApp(defineComponent({
    setup: () => () => h(PersonalInfo, { settings: settings.value, 'onUpdate-setting': saved }),
  }));
  app.mount(el);
  return { el, settings, saved };
}

async function input(el: HTMLElement, id: string, value: string) {
  const field = el.querySelector<HTMLInputElement>(`#${id}`)!;
  field.value = value;
  field.dispatchEvent(new Event('input', { bubbles: true }));
  await nextTick();
}

it('keeps address edits detached and submits a guarded copy of the personal draft', async () => {
  vi.useFakeTimers();
  const original = { name: 'Ada', address: { street: 'First', city: '', state: '', postalCode: '', country: 'US' } };
  const { el, saved } = render(original);
  await input(el, 'street', 'Second');
  expect(original.address.street).toBe('First');
  vi.advanceTimersByTime(500);
  const update = saved.mock.calls[0][0] as SettingUpdate;
  expect(update.value).toMatchObject({ name: 'Ada', address: { street: 'Second' } });
  expect(update.condition).toEqual({ runId: 'personal-run', expected: { exists: true, value: original } });
  await input(el, 'street', 'Third');
  expect(update.value).toMatchObject({ address: { street: 'Second' } });
});

it('follows reset and remote values without saving them or a superseded draft', async () => {
  vi.useFakeTimers();
  const { el, settings, saved } = render({ name: 'Ada' });
  await input(el, 'name', 'Pending');
  settings.value = { name: 'Grace', address: { street: 'Remote', city: '', state: '', postalCode: '', country: 'CA' } };
  await nextTick();
  expect(el.querySelector<HTMLInputElement>('#name')!.value).toBe('Grace');
  expect(el.querySelector<HTMLInputElement>('#street')!.value).toBe('Remote');
  vi.advanceTimersByTime(500);
  expect(saved).not.toHaveBeenCalled();
  settings.value = {};
  await nextTick();
  expect(el.querySelector<HTMLInputElement>('#name')!.value).toBe('');
  expect(el.querySelector<HTMLInputElement>('#street')!.value).toBe('');
  vi.advanceTimersByTime(500);
  expect(saved).not.toHaveBeenCalled();
});

it('does not save after the form is disposed', async () => {
  vi.useFakeTimers();
  const { el, saved } = render({ name: 'Ada' });
  await input(el, 'name', 'Pending');
  app!.unmount(); app = undefined;
  vi.advanceTimersByTime(500);
  expect(saved).not.toHaveBeenCalled();
});
