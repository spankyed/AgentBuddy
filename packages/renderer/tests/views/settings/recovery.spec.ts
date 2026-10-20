import { afterEach, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, ref, type App } from 'vue';
import type { SettingsRecovery as Recovery, SettingsWriteResult } from '@apackdev/sdk/types';
import SettingsRecovery from '@/views/settings/SettingsRecovery.vue';

const io = vi.hoisted(() => ({ recover: vi.fn(), relaunch: vi.fn() }));
vi.mock('@/runtime/settings', () => ({ windowSettings: { recover: io.recover } }));
let app: App | undefined;
afterEach(() => { app?.unmount(); app = undefined; vi.clearAllMocks(); vi.unstubAllGlobals(); });

function render(recovery: Recovery) {
  const value = ref(recovery);
  io.recover.mockResolvedValue({ status: 'saved' } satisfies SettingsWriteResult);
  vi.stubGlobal('electronAPI', { apiStatus: { relaunch: io.relaunch } });
  const el = document.createElement('div');
  app = createApp(defineComponent({ setup: () => () => h(SettingsRecovery, { recovery: value.value }) }));
  app.mount(el);
  return { el, value };
}
async function click(el: HTMLElement, text: string) {
  const button = [...el.querySelectorAll('button')].find(button => button.textContent === text)!;
  expect(button).toBeDefined();
  button.click();
  await nextTick();
  await nextTick();
}
const invalid: Recovery = { version: { runId: 'run', revision: 0 }, problems: [
  { target: { kind: 'app' }, path: ['projects'], message: 'must be array' },
  { target: { kind: 'feature', featureRef: 'memo/notes' }, path: ['limit'], message: 'must be integer' },
] };

it('shows attributed errors, confirms the selected groups, and offers relaunch once repaired', async () => {
  const { el, value } = render(invalid);
  expect(el.textContent).toContain('app · projects: must be array');
  expect(el.querySelectorAll('input:checked')).toHaveLength(2);
  await click(el, 'Reset selected groups');
  expect(io.recover).not.toHaveBeenCalled();
  await click(el, 'Confirm reset');
  expect(io.recover).toHaveBeenCalledWith({ version: invalid.version, reset: invalid.problems.map(problem => problem.target) });
  value.value = { version: { ...invalid.version, revision: 1 }, problems: [] };
  await nextTick();
  expect(el.textContent).toContain('Settings repaired');
  await click(el, 'Restart app');
  expect(io.relaunch).toHaveBeenCalledTimes(1);
});

it('offers only a complete reset for a malformed document', async () => {
  const { el } = render({ ...invalid, problems: [{ path: [], message: 'Malformed document' }] });
  expect([...el.querySelectorAll('button')].map(button => button.textContent)).toEqual(['Reset all preferences']);
  await click(el, 'Reset all preferences');
  expect(el.textContent).toContain('unavailable packs');
  await click(el, 'Confirm reset');
  expect(io.recover).toHaveBeenCalledWith({ version: invalid.version, reset: 'all' });
});

it('shows a refusal and asks for confirmation again when the diagnostics change', async () => {
  const { el, value } = render(invalid);
  io.recover.mockResolvedValue({ status: 'refused', problems: ['Review current problems'] });
  await click(el, 'Reset selected groups');
  await click(el, 'Confirm reset');
  expect(el.textContent).toContain('Review current problems');
  expect(el.textContent).not.toContain('Settings repaired');
  await click(el, 'Reset selected groups');
  value.value = { ...invalid, version: { ...invalid.version, revision: 1 } };
  await nextTick();
  expect(el.textContent).not.toContain('Confirm reset');
});


it('sends only the groups explicitly selected and keeps the group list visible during confirmation', async () => {
  const { el } = render(invalid);
  const fields = el.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
  fields[0].checked = false;
  fields[0].dispatchEvent(new Event('change', { bubbles: true }));
  await nextTick();
  await click(el, 'Reset selected groups');
  expect(el.textContent).toContain('Other groups will be kept.');
  expect(el.querySelectorAll('input:checked')).toHaveLength(1);
  io.recover.mockImplementationOnce(async request => {
    structuredClone(request); // The window transport clones requests; Vue proxies must not cross it.
    return { status: 'saved' } satisfies SettingsWriteResult;
  });
  await click(el, 'Confirm reset');
  await expect(io.recover.mock.results[0].value).resolves.toEqual({ status: 'saved' });
  expect(io.recover).toHaveBeenCalledWith({ version: invalid.version, reset: [invalid.problems[1].target] });
});
