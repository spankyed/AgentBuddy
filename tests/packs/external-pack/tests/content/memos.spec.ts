import { describe, expect, it } from 'vitest';
import { importContent } from '@abuddy/testing/harness';
import { getPackCommands } from '@abuddy/sdk/framework';
import { untypedQx } from '@abuddy/ears';
import { repository } from '#generated/repository.ts';

describe('memo content', () => {
  it('content memos from its markdown format and its compiler module format', async () => {
    const counts = await importContent();
    // This pack's own content, exactly. The run also content default-setup's library, whose count is that
    // pack's business and moves when its folders do, so this matches rather than equals.
    expect(counts).toMatchObject({
      memos: { created: 1, updated: 0, skipped: 0 },
      'quick-memos': { created: 1, updated: 0, skipped: 0 },
    });
    expect(repository.memoQueries.all().map((memo) => memo.text).sort()).toEqual(['Written by a compiler module', 'Written from markdown\n']);
  });

  it('starts each test from an empty database and skips unchanged rows on a re-apply', async () => {
    expect(repository.memoQueries.all()).toEqual([]);
    await importContent({ keys: ['memos'] });
    expect(await importContent({ keys: ['memos'] })).toEqual({ memos: { created: 0, updated: 0, skipped: 1 } });
  });
});

// The chat lists a pack's commands from two places: its manifest, and the documents it content into
// default-setup's internal/commands folder for users to edit
describe('slash commands', () => {
  it("registers the pack's declared command, and content its command document", async () => {
    expect(getPackCommands()).toContainEqual({ name: 'memo-note', placeholder: 'Memo text' });

    await importContent({ keys: ['library'] });

    const document = untypedQx('Document').where('name', 'Memo commands').pickAll()[0];
    expect(document.content).toEqual([{ type: 'field', fields: [{ key: 'memo-list', value: 'Tag (optional)' }] }]);
  });
});
