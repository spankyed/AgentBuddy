// A FeatureAddress comes only from the resolver or a registry, so a string pack code wrote by hand can't reach
// a call that takes one. The expectations below are checked by `npm run typecheck`, not at run time.
import { expect, it } from 'vitest';
import { asHostAddress, qualifiedId, resolveName, type FeatureAddress } from '../../src/ids/index.ts';
import { navigateToAddress } from '../../src/fe/navigation.ts';

it('is a string at run time, and only the resolver or a registry makes one', () => {
  const resolved: FeatureAddress = resolveName('memos', { packId: 'memo-pack' });
  const registered: FeatureAddress = qualifiedId('memo-pack', 'memos');
  const host: FeatureAddress = asHostAddress('application');
  expect([resolved, registered, host]).toEqual(['memo-pack.memos', 'memo-pack.memos', 'application']);

  // @ts-expect-error a hand-written address isn't one
  const written: FeatureAddress = 'memo-pack.memos';
  expect(written).toBe(registered);

  // An address still reads as the string it is
  const text: string = registered;
  expect(text.startsWith('memo-pack.')).toBe(true);
});

it('keeps a hand-written string out of the host-only navigation', () => {
  // Typed only: calling it needs a bound frontend host
  const typed = (): void => {
    // @ts-expect-error navigation takes an address, not a string
    navigateToAddress('memo-pack.memos');
  };
  expect(typeof typed).toBe('function');
});
