import { expect, it } from 'vitest';
import { entityIs } from '../../src/fe/navigation.ts';

it('guards entity destination types and ignores other events', () => {
  const guard = entityIs<'Note'>;
  const note = { type: 'OPEN_ENTITY', id: 'Note-one' };
  expect(guard({ event: note }, { entity: 'Note' })).toBe(true);
  expect(guard({ event: { ...note, id: 'Thread-one' } }, { entity: 'Note' })).toBe(false);
  expect(guard({ event: { type: 'OTHER' } }, { entity: 'Note' })).toBe(false);
  expect(guard({ event: { ...note, id: 'Note' } }, { entity: 'Note' })).toBe(false);
  expect(guard({ event: { ...note, id: 'Note-' } }, { entity: 'Note' })).toBe(true);
  // @ts-expect-error A guard bound to this contract cannot name another destination type.
  guard({ event: note }, { entity: 'Thread' });
});
