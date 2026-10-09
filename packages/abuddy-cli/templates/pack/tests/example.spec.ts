import { describe, it, expect } from 'vitest';
import { importContent } from '@abuddy/testing/harness';
import { EARS, findAll } from '#generated/ears.ts';

describe('__NAME__', () => {
  it('should have a valid manifest', async () => {
    const manifest = await import('../abuddy.json', { with: { type: 'json' } });
    expect(manifest.default.id).toBe('__NAME__');
  });

  it('content the examples entry', async () => {
    expect(await importContent({ keys: ['__CONTENT_KEY__'] })).toEqual({ __CONTENT_KEY__: { created: 1, updated: 0, skipped: 0 } });
    expect(findAll(EARS.Entity.__PASCAL__).map((row) => row.title)).toEqual(['Hello']);
  });
});
