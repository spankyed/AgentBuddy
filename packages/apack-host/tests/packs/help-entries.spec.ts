import { describe, expect, it } from 'vitest';
import type { HelpDocument } from '@apackdev/sdk/framework';
import { createPackRegistry } from '../../src/packs/registry.ts';

const article = (id: string): HelpDocument => ({ id, title: id, body: `About ${id}` });
describe('the pack-qualified help catalog', () => {
  it('keeps identical article IDs distinct across packs and sorts by display name', () => {
    const registry = createPackRegistry();
    registry.registerPack({ id: 'second', name: 'Zebra', help: [article('start')] });
    registry.registerPack({ id: 'first', name: 'Alpha', help: [article('start')] });
    expect(registry.help().articles.map(a => [a.packId, a.id])).toEqual([['first', 'start'], ['second', 'start']]);
  });
  it('updates a reloaded pack and removes its articles on unregister', () => {
    const registry = createPackRegistry();
    registry.registerPack({ id: 'pack', help: [article('old')] });
    registry.unregisterPack('pack');
    registry.registerPack({ id: 'pack', help: [article('new')] });
    expect(registry.help().articles.map(a => a.id)).toEqual(['new']);
    registry.unregisterPack('pack');
    expect(registry.help()).toEqual({ articles: [], problems: [] });
  });
  it('reports a malformed contribution without losing other articles', () => {
    const registry = createPackRegistry();
    registry.registerPack({ id: 'good', help: [article('valid')] });
    registry.registerPack({ id: 'broken', help: [article('duplicate'), article('duplicate')] });
    expect(registry.help().articles.map(a => a.packId)).toEqual(['good']);
    expect(registry.help().problems[0].packId).toBe('broken');
    registry.unregisterPack('broken');
    expect(registry.help().problems).toEqual([]);
  });
  it('orders articles by explicit order, then title', () => {
    const registry = createPackRegistry();
    registry.registerPack({ id: 'pack', help: [article('z'), article('a'), { ...article('first'), order: 1 }] });
    expect(registry.help().articles.map(a => a.id)).toEqual(['first', 'a', 'z']);
  });
});
