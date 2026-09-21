// The backend registry's command and feature settings stores: what a registry does with a pack's declared
// commands and feature settings when it registers and unregisters
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCommandStore, createSettingsDefaultsStore } from '../../src/packs/backend-extensions.ts';

describe('the command store', () => {
  let packCommandsRegistry: ReturnType<typeof createCommandStore>;
  const getPackCommands = () => packCommandsRegistry.all();
  beforeEach(() => { packCommandsRegistry = createCommandStore(); });

  it("lists registered packs' commands in registration order and drops a pack's when it unregisters", () => {
    packCommandsRegistry.register('memo-pack', [{ name: 'standup', placeholder: 'Topic' }, { name: 'memo', placeholder: 'Text' }]);
    packCommandsRegistry.register('todo-pack', [{ name: 'todo', placeholder: 'Task' }]);
    expect(getPackCommands()).toEqual([
      { name: 'standup', placeholder: 'Topic' },
      { name: 'memo', placeholder: 'Text' },
      { name: 'todo', placeholder: 'Task' },
    ]);

    packCommandsRegistry.unregister('memo-pack');
    expect(getPackCommands()).toEqual([{ name: 'todo', placeholder: 'Task' }]);
  });

  it('rejects a command another pack declares, registering none of the pack', () => {
    packCommandsRegistry.register('memo-pack', [{ name: 'standup', placeholder: 'Topic' }]);

    expect(() => packCommandsRegistry.register('clashing-pack', [{ name: 'digest', placeholder: 'Week' }, { name: 'standup', placeholder: 'Theirs' }]))
      .toThrow('Command collision: "standup" — pack "clashing-pack" vs "memo-pack"');

    expect(getPackCommands()).toEqual([{ name: 'standup', placeholder: 'Topic' }]);
  });

  it("re-registers a pack's own commands: a rebuilt pack keeps the names it had", () => {
    packCommandsRegistry.register('memo-pack', [{ name: 'standup', placeholder: 'Topic' }]);
    packCommandsRegistry.unregister('memo-pack');

    expect(() => packCommandsRegistry.register('memo-pack', [{ name: 'standup', placeholder: 'Topic, revised' }])).not.toThrow();
    expect(getPackCommands()).toEqual([{ name: 'standup', placeholder: 'Topic, revised' }]);
  });

  it('replaces the commands of a pack registered twice, keeping its place in the order', () => {
    packCommandsRegistry.register('memo-pack', [{ name: 'standup', placeholder: 'Topic' }]);
    packCommandsRegistry.register('todo-pack', [{ name: 'todo', placeholder: 'Task' }]);
    packCommandsRegistry.register('memo-pack', [{ name: 'memo', placeholder: 'Text' }]);

    expect(getPackCommands().map((command) => command.name)).toEqual(['memo', 'todo']);

    packCommandsRegistry.register('memo-pack', []);
    expect(getPackCommands().map((command) => command.name)).toEqual(['todo']);
  });

  it('puts a pack that unregisters and registers again (a reload or update) back in its first place', () => {
    packCommandsRegistry.register('first-pack', [{ name: 'first', placeholder: 'A' }]);
    packCommandsRegistry.register('second-pack', [{ name: 'second', placeholder: 'B' }]);

    packCommandsRegistry.unregister('first-pack');
    packCommandsRegistry.register('first-pack', [{ name: 'first', placeholder: 'A, rebuilt' }]);

    expect(getPackCommands().map((command) => command.name)).toEqual(['first', 'second']);
  });

  it("hands out copies: changing a listed command or the declared array doesn't change the registry", () => {
    const declared = [{ name: 'standup', placeholder: 'Topic' }];
    packCommandsRegistry.register('memo-pack', declared);

    declared[0].placeholder = 'Changed by the caller';
    getPackCommands()[0].placeholder = 'Changed by a reader';

    expect(getPackCommands()).toEqual([{ name: 'standup', placeholder: 'Topic' }]);
  });
});

describe('the feature settings defaults store', () => {
  let packSettingsRegistry: ReturnType<typeof createSettingsDefaultsStore>;
  const getPackSettingsDefaults = () => packSettingsRegistry.get();
  const onPackSettingsDefaultsChanged = (listener: () => void) => packSettingsRegistry.onChanged(listener);
  beforeEach(() => { packSettingsRegistry = createSettingsDefaultsStore(); });

  it("merges registered packs' feature settings and drops a pack's when it unregisters", () => {
    const listener = vi.fn();
    const unsubscribe = onPackSettingsDefaultsChanged(listener);
    const before = getPackSettingsDefaults().revision;

    packSettingsRegistry.register('memo-pack', [
      { id: 'memos', settings: { visible: false, plugins: { memos: { sort: 'newest' } } } },
      { id: 'no-settings' },
    ]);
    packSettingsRegistry.register('todo-pack', [{ id: 'todos', settings: { plugins: { todos: { done: true } } } }]);
    expect(getPackSettingsDefaults()).toEqual({
      revision: before + 2,
      settings: { plugins: { 'memo-pack/memos': { sort: 'newest' }, 'todo-pack/todos': { done: true } } },
      visibility: { 'memo-pack/memos': false },
    });

    packSettingsRegistry.unregister('memo-pack');
    expect(getPackSettingsDefaults().settings).toEqual({ plugins: { 'todo-pack/todos': { done: true } } });
    expect(listener).toHaveBeenCalledTimes(3);

    unsubscribe();
    packSettingsRegistry.unregister('todo-pack');
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("rejects a pack whose feature sets another plugin's settings, registering nothing", () => {
    const before = getPackSettingsDefaults();
    expect(() => packSettingsRegistry.register('bad-pack', [{ id: 'memos', settings: { plugins: { threads: { hidden: true } } } }]))
      .toThrow(/Pack "bad-pack" has invalid feature settings:\n {2}Feature "memos" settings set "plugins.threads"/);
    expect(getPackSettingsDefaults()).toBe(before);
  });
});
