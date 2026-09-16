import { afterEach, describe, expect, it } from 'vitest';
import { getPackCommands, packCommandsRegistry } from '../../src/framework/pack-commands.ts';

afterEach(() => {
  for (const id of ['memo-pack', 'todo-pack', 'clashing-pack']) packCommandsRegistry.unregister(id);
});

describe('packCommandsRegistry', () => {
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

  it("hands out copies: changing a listed command or the declared array doesn't change the registry", () => {
    const declared = [{ name: 'standup', placeholder: 'Topic' }];
    packCommandsRegistry.register('memo-pack', declared);

    declared[0].placeholder = 'Changed by the caller';
    getPackCommands()[0].placeholder = 'Changed by a reader';

    expect(getPackCommands()).toEqual([{ name: 'standup', placeholder: 'Topic' }]);
  });
});
