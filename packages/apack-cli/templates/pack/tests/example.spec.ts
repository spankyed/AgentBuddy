import { describe, it, expect } from 'vitest';
import { importContent } from '@apackdev/testing/harness';
import { EARS, query } from '#generated/ears.ts';

describe('__NAME__', () => {
  it('should have a valid manifest', async () => {
    const manifest = await import('../apack.json', { with: { type: 'json' } });
    expect(manifest.default.id).toBe('__NAME__');
  });

  it('content the examples entry', async () => {
    expect(await importContent({ keys: ['__CONTENT_KEY__'] })).toEqual({ __CONTENT_KEY__: { created: 1, updated: 0, skipped: 0 } });
    expect(query(EARS.Entity.__PASCAL__).pickAll().map((row) => row.title)).toEqual(['Hello']);
  });
});
