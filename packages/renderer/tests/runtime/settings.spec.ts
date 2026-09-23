// What frontend code reads and changes of the app's settings, over the running Settings view. The port is the one
// place a target the SDK names (a section, a feature) becomes an event the view takes, so this is where the two
// contracts are checked against each other: `SettingsTarget` in @abuddy/sdk/fe and the one in @abuddy/host/fe are
// different shapes, and a section addressed as a sub-key would write one level too deep, silently.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@/transport/secrets', () => ({ secretsClient: {} }));
vi.mock('@/transport/client', () => ({ feClient: { send: () => {}, subscribe: () => () => {} } }));

const { settingsPort } = await import('@/runtime/settings');
const { startFeTestRuntime, stopFeTestRuntime } = await import('@abuddy/sdk/testing');
const { HOST } = await import('@abuddy/host/fe');

const SETTINGS_DOC = {
  general: { projects: [{ name: 'one' }], application: { hotkeys: {} } },
  assistant: { name: 'Buddy' },
  plugins: { 'default-setup/code': { mdEditorDefault: true } },
};

const sent: unknown[] = [];
let listener: (() => void) | undefined;
let context: Record<string, unknown> = {};

/** The Settings view's actor, as the shell holds it */
const settingsActor = {
  getSnapshot: () => ({ context }),
  send: (event: unknown) => void sent.push(event),
  subscribe: (fn: () => void) => { listener = fn; return { unsubscribe: () => { listener = undefined; } }; },
};

beforeEach(() => {
  sent.length = 0;
  context = { settings: SETTINGS_DOC, save: { status: 'idle', problems: [] } };
  startFeTestRuntime({
    application: { system: { get: (ref: string) => (ref === HOST.settings ? settingsActor : undefined) } } as never,
    settings: settingsPort,
    packs: { designation: (role: string) => (role === 'settings' ? HOST.settings : undefined) } as never,
  });
});
afterEach(() => stopFeTestRuntime());

it('reads a section by the name whoever registered it gave', () => {
  expect(settingsPort.section('general')).toEqual(SETTINGS_DOC.general);
  expect(settingsPort.section('assistant')).toEqual({ name: 'Buddy' });
  expect(settingsPort.section('nothing-registers-this')).toBeUndefined();
});

it("reads a feature's own settings by its ref", () => {
  expect(settingsPort.feature('default-setup/code' as never)).toEqual({ mdEditorDefault: true });
  expect(settingsPort.feature('default-setup/notes' as never)).toBeUndefined();
});

// The bug this covers: mapping `section` onto the view's `label` wrote `general.general.projects`, which nothing
// reads, so every project the explorer changed was lost without an error
it('addresses a section at the section, not one level inside it', () => {
  settingsPort.update({ section: 'general' }, ['projects'], [{ name: 'two' }]);

  expect(sent).toEqual([{
    type: 'SETTINGS.UPDATE', entityType: 'section', label: 'general', path: ['projects'], value: [{ name: 'two' }],
  }]);
});

it('addresses a section that is not `general` as itself', () => {
  settingsPort.update({ section: 'assistant' }, ['name'], 'Ada');

  expect(sent).toEqual([{
    type: 'SETTINGS.UPDATE', entityType: 'section', label: 'assistant', path: ['name'], value: 'Ada',
  }]);
});

it("addresses a feature's settings by its ref", () => {
  settingsPort.update({ feature: 'default-setup/code' as never }, ['cliPaths', 'gh'], '/opt/bin/gh');

  expect(sent).toEqual([{
    type: 'SETTINGS.UPDATE', entityType: 'plugin', label: 'default-setup/code', path: ['cliPaths', 'gh'], value: '/opt/bin/gh',
  }]);
});

it('follows the view until the caller unsubscribes', () => {
  const heard = vi.fn();
  const stop = settingsPort.subscribe(heard);

  listener?.();
  expect(heard).toHaveBeenCalledTimes(1);

  stop();
  listener?.();
  expect(heard).toHaveBeenCalledTimes(1);
});

it('reads the last change the store answered for', () => {
  context = { settings: SETTINGS_DOC, save: { status: 'refused', problems: ['nope'] } };
  expect(settingsPort.saveStatus()).toEqual({ status: 'refused', problems: ['nope'] });
});

it('answers as idle and empty before the view has its settings', () => {
  context = {};
  expect(settingsPort.section('general')).toBeUndefined();
  expect(settingsPort.saveStatus()).toEqual({ status: 'idle', problems: [] });
});
