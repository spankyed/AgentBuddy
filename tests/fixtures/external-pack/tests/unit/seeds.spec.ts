import { describe, expect, it } from 'vitest';
import { importSeeds } from '@abuddy/testing/harness';
import { getPackCommands } from '@abuddy/sdk/framework';
import { untypedQx } from '@abuddy/ears';
import { repository } from '#generated/repository';

describe('memo seeds', () => {
  it('seeds memos from its markdown format and its compiler module format', async () => {
    const counts = await importSeeds();
    // This pack's own seeds, exactly. The run also seeds default-setup's library, whose count is that
    // pack's business and moves when its folders do, so this matches rather than equals.
    expect(counts).toMatchObject({
      memos: { created: 1, updated: 0, skipped: 0 },
      'quick-memos': { created: 1, updated: 0, skipped: 0 },
    });
    expect(repository.memoQueries.all().map((memo) => memo.text).sort()).toEqual(['Seeded by a compiler module', 'Seeded from markdown\n']);
  });

  it('starts each test from an empty database and skips unchanged rows on a re-seed', async () => {
    expect(repository.memoQueries.all()).toEqual([]);
    await importSeeds({ keys: ['memos'] });
    expect(await importSeeds({ keys: ['memos'] })).toEqual({ memos: { created: 0, updated: 0, skipped: 1 } });
  });
});

// The chat lists a pack's commands from two places: its manifest, and the documents it seeds into
// default-setup's internal/commands folder for users to edit
describe('slash commands', () => {
  it("registers the pack's declared command, and seeds its command document", async () => {
    expect(getPackCommands()).toContainEqual({ name: 'memo-note', placeholder: 'Memo text' });

    await importSeeds({ keys: ['library'] });

    const document = untypedQx('Document').where('name', 'Memo commands').pickAll()[0];
    expect(document.content).toEqual([{ type: 'field', fields: [{ key: 'memo-list', value: 'Tag (optional)' }] }]);
  });
});
