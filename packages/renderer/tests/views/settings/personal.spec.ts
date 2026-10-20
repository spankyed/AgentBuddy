import { afterEach, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, ref, type App } from 'vue';
import type { AppPersonalInfo, SettingUpdate } from '@apackdev/sdk/types';
import PersonalInfo from '@/views/settings/canvas/components/GeneralSettings/PersonalInfo.vue';

vi.mock('@/runtime/settings', () => ({ useWindowSettingsSnapshot: () => ref({ runId: 'personal-run' }) }));

let app: App | undefined;
afterEach(() => { app?.unmount(); app = undefined; vi.useRealTimers(); });

function render(value: AppPersonalInfo) {
  const settings = ref(value);
  const saved = vi.fn(async (_update: SettingUpdate) => ({ status: 'saved' as const }));
  const el = document.createElement('div');
  app = createApp(defineComponent({
    setup: () => () => h(PersonalInfo, { settings: settings.value, saveSetting: saved }),
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


it('preserves newer typing when the previous save is echoed and then submits it against that saved value', async () => {
  vi.useFakeTimers();
  const { el, settings, saved } = render({ name: 'Ada' });
  let finish!: (result: { status: 'saved' }) => void;
  saved.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await input(el, 'name', 'Grace');
  await vi.advanceTimersByTimeAsync(500);
  const first = saved.mock.calls[0][0];
  await input(el, 'name', 'Grace Hopper');
  settings.value = first.value as AppPersonalInfo;
  await nextTick();
  expect(el.querySelector<HTMLInputElement>('#name')!.value).toBe('Grace Hopper');
  finish({ status: 'saved' });
  await vi.advanceTimersByTimeAsync(500);
  expect(saved).toHaveBeenCalledTimes(2);
  expect(saved.mock.calls[1][0]).toMatchObject({ value: { name: 'Grace Hopper' },
    condition: { expected: { exists: true, value: first.value } } });
});

it('discards queued typing when a remote reset supersedes an in-flight save', async () => {
  vi.useFakeTimers();
  const { el, settings, saved } = render({ name: 'Ada' });
  let finish!: (result: { status: 'saved' }) => void;
  saved.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await input(el, 'name', 'Grace');
  await vi.advanceTimersByTimeAsync(500);
  await input(el, 'name', 'New draft');
  settings.value = {};
  await nextTick();
  finish({ status: 'saved' });
  await vi.advanceTimersByTimeAsync(500);
  expect(el.querySelector<HTMLInputElement>('#name')!.value).toBe('');
  expect(saved).toHaveBeenCalledTimes(1);
});


it('preserves pending typing across an equivalent snapshot from an unrelated settings write', async () => {
  vi.useFakeTimers();
  const { el, settings, saved } = render({ name: 'Ada' });
  await input(el, 'name', 'Pending');
  settings.value = { name: 'Ada' };
  await nextTick();
  expect(el.querySelector<HTMLInputElement>('#name')!.value).toBe('Pending');
  await vi.advanceTimersByTimeAsync(500);
  expect(saved.mock.calls[0][0]).toMatchObject({ value: { name: 'Pending' } });
});
