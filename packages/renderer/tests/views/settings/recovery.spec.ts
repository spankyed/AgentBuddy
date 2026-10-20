import { afterEach, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, ref, type App } from 'vue';
import type { SettingsRecovery as Recovery, SettingsWriteResult } from '@apackdev/sdk/types';
import SettingsRecovery from '@/views/settings/SettingsRecovery.vue';

const io = vi.hoisted(() => ({ recover: vi.fn(), relaunch: vi.fn() }));
vi.mock('@/runtime/settings', () => ({ settingsPort: {}, windowSettings: { recover: io.recover } }));
let app: App | undefined;
afterEach(() => { app?.unmount(); app = undefined; vi.clearAllMocks(); vi.unstubAllGlobals(); });

function render(recovery: Recovery) {
  const value = ref(recovery);
  const status = ref('recovery' as 'ready' | 'recovery');
  io.recover.mockResolvedValue({ status: 'saved' } satisfies SettingsWriteResult);
  vi.stubGlobal('electronAPI', { apiStatus: { relaunch: io.relaunch } });
  const el = document.createElement('div');
  app = createApp(defineComponent({ setup: () => () => h(SettingsRecovery, { recovery: value.value, status: status.value }) }));
  app.mount(el);
  return { el, value, status };
}
async function click(el: HTMLElement, text: string) {
  const button = [...el.querySelectorAll('button')].find(button => button.textContent === text)!;
  expect(button).toBeDefined();
  button.click();
  await nextTick();
  await nextTick();
}
const invalid: Recovery = { status: 'invalid', version: { runId: 'run', revision: 0, catalogRevision: 1 }, problems: [
  { target: { kind: 'app' }, path: ['projects'], message: 'must be array' },
  { target: { kind: 'feature', featureRef: 'memo/notes' }, path: ['limit'], message: 'must be integer' },
] };

it('shows attributed errors, confirms selected groups, and offers the existing relaunch action', async () => {
  const { el } = render(invalid);
  expect(el.textContent).toContain('app · projects: must be array');
  expect(el.querySelectorAll('input:checked')).toHaveLength(2);
  await click(el, 'Reset selected groups');
  expect(io.recover).not.toHaveBeenCalled();
  await click(el, 'Confirm reset');
  expect(io.recover).toHaveBeenCalledWith({ version: invalid.version, reset: invalid.problems.map(problem => problem.target) });
  expect(el.textContent).toContain('Settings repaired');
  await click(el, 'Restart app');
  expect(io.relaunch).toHaveBeenCalledTimes(1);
});

it('requires complete reset for malformed documents and never calls app-data reset', async () => {
  const { el } = render({ ...invalid, problems: [{ path: [], message: 'Malformed document' }] });
  expect(el.querySelectorAll('input')).toHaveLength(0);
  await click(el, 'Reset all preferences');
  expect(el.textContent).toContain('unavailable packs');
  await click(el, 'Confirm reset');
  expect(io.recover).toHaveBeenCalledWith({ version: invalid.version, reset: 'all' });
});

it('shows a stale-request refusal and requires confirmation again for refreshed diagnostics', async () => {
  const { el, value } = render(invalid);
  io.recover.mockResolvedValue({ status: 'refused', problems: ['Review current problems'] });
  await click(el, 'Reset selected groups');
  await click(el, 'Confirm reset');
  expect(el.textContent).toContain('Review current problems');
  expect(el.textContent).not.toContain('Settings repaired');
  value.value = { ...invalid, version: { ...invalid.version, catalogRevision: 2 } };
  await nextTick();
  expect(el.textContent).not.toContain('Confirm reset');
});

it('follows another window completing repair and offers restart', async () => {
  const { el, value } = render(invalid);
  value.value = { ...invalid, status: 'repaired', problems: [] };
  await nextTick();
  expect(el.textContent).toContain('Settings repaired');
  expect(io.recover).not.toHaveBeenCalled();
});
