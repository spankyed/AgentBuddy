import { describe, expect, it } from 'vitest';
import { seedPack } from '@abuddy/testing/harness';
import { repository } from '#generated/repository';

describe('memo seeds', () => {
  it('seeds memos from its markdown format and its compiler module format', async () => {
    const counts = await seedPack();
    expect(counts).toEqual({
      memos: { created: 1, updated: 0, skipped: 0 },
      'quick-memos': { created: 1, updated: 0, skipped: 0 },
    });
    expect(repository.memoQueries.all().map((memo) => memo.text).sort()).toEqual(['Seeded by a compiler module', 'Seeded from markdown\n']);
  });

  it('starts each test from an empty database and skips unchanged rows on a re-seed', async () => {
    expect(repository.memoQueries.all()).toEqual([]);
    await seedPack({ keys: ['memos'] });
    expect(await seedPack({ keys: ['memos'] })).toEqual({ memos: { created: 0, updated: 0, skipped: 1 } });
  });
});
