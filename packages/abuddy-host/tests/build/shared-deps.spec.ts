// The app-only exports (the LMDB store) stay out of what pack code shares: the app's bridge and the harness's
import { describe, expect, it } from 'vitest';
import { APP_ONLY_EXPORTS, sharedInstanceExports, sharedInstanceSpecifiers } from '../../src/build/shared-deps.ts';
import { appBridgedSpecifiers } from '../../src/build/shared-modules.ts';

describe('APP_ONLY_EXPORTS', () => {
  it('names exports @abuddy/ears has', () => {
    const exported = sharedInstanceExports('@abuddy/ears', import.meta.filename);
    expect(Object.keys(APP_ONLY_EXPORTS)).toEqual(['@abuddy/ears/lmdb']);
    expect(Object.keys(exported)).toContain('./lmdb');
  });

  it('leaves them out of the shared specifiers the harness bridges and the app bridge', () => {
    const specifiers = sharedInstanceSpecifiers('@abuddy/ears', sharedInstanceExports('@abuddy/ears', import.meta.filename));
    expect(specifiers).toContain('@abuddy/ears');
    expect(specifiers).not.toContain('@abuddy/ears/internals');
    expect(specifiers).not.toContain('@abuddy/ears/lmdb');
    expect(appBridgedSpecifiers(import.meta.filename)).not.toContain('@abuddy/ears/lmdb');
  });
});
