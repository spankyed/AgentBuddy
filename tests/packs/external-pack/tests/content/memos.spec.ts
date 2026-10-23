import { describe, expect, it } from 'vitest';
import { importContent } from '@apackdev/testing/harness';
import { getCommands } from '@apackdev/sdk/commands';
import { untypedQx } from '@apackdev/ears';
import { repository } from '#generated/repository.ts';

describe('memo content', () => {
  it('content memos from its markdown format and its compiler module format', async () => {
    const counts = await importContent();
    // This pack's own content, exactly. The run also writes its command document through default-setup's
    // `commands` format, whose count is that pack's business, so this matches rather than equals.
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

// A pack's slash commands are documents, and it has two ways to get them: a content directory compiled
// with default-setup's `commands` format, or `extensions.commands` in its manifest. This pack uses both,
// which is the case worth pinning — the shorthand compiles under its own reserved key, so it neither
// collides with the pack's own `commands` source nor merges into its document.
describe('slash commands', () => {
  it("writes its command document and has its command served", async () => {
    await importContent({ keys: ['commands'] });

    const document = untypedQx('Document').where('name', 'Memo commands').pickAll()[0];
    expect(document.content).toEqual([{ type: 'field', fields: [{ key: 'memo-list', value: 'Tag (optional)' }] }]);
    expect(getCommands()).toContainEqual({ name: 'memo-list', placeholder: 'Tag (optional)' });
  });

  // Ordinary content once desugared, so removal, offers and the three-way merge are the shared
  // machinery's and are tested there; what is this key's own is the document it compiles to
  it('writes the commands its manifest declares as a document of their own', async () => {
    await importContent({ keys: ['declared-commands'] });

    const document = untypedQx('Document').where('name', 'e2e-fixture commands').pickAll()[0];
    expect(document.documentType).toBe('commands');
    expect(document.content).toEqual([{ type: 'field', fields: [{ key: 'memo-quick', value: 'What to note' }] }]);
    expect(getCommands()).toContainEqual({ name: 'memo-quick', placeholder: 'What to note' });
  });

});
