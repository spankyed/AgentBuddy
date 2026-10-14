import { z } from 'zod';
import { PACK_ID_PATTERN } from '../ids/refs.ts';
import type { ContentIndex } from './content-compiler.ts';

const ContentIndexSchema: z.ZodType<ContentIndex> = z.object({
  version: z.literal(1).describe('The compiled content index format.'),
  packId: z.string().regex(PACK_ID_PATTERN).describe('The pack that compiled this content.'),
  entries: z.array(z.object({
    key: z.string().min(1).describe('The declared content source or dataset key.'),
    written: z.boolean().describe('Whether this entry is applied to the database.'),
    identity: z.array(z.string()).optional(),
    count: z.number().int().nonnegative().describe('The compiler-reported item count.'),
    items: z.array(z.object({
      key: z.string(), description: z.string().optional(), childCount: z.number().int().nonnegative().optional(),
    }).strict()).describe('Compiled item identities and descriptions, independent of registered providers.'),
  }).strict()),
}).strict().superRefine((index, context) => {
  const names = new Set<string>();
  for (const [position, entry] of index.entries.entries()) {
    if (names.has(entry.key)) context.addIssue({ code: 'custom', path: ['entries', position, 'key'], message: `Content key "${entry.key}" is declared twice in the index` });
    names.add(entry.key);
  }
});

/** Validate the current compiled index without loading compilers, content modules or providers. */
export function parseContentIndex(raw: unknown): ContentIndex {
  return ContentIndexSchema.parse(raw);
}
