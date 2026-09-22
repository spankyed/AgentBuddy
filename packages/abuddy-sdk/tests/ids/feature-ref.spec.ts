// A FeatureRef comes only from the resolver or a registry, so a string pack code wrote by hand can't reach
// a call that takes one. The expectations below are checked by `npm run typecheck`, not at run time.
import { expect, it } from 'vitest';
import { resolveName, type FeatureRef } from '../../src/ids/index.ts';
import { openRef } from '../../src/fe/navigation.ts';

it('is a string at run time, and only the resolver or a registry makes one', () => {
  const resolved: FeatureRef = resolveName('memos', 'memo-pack');
  const host: FeatureRef = resolveName('host/application');
  expect([resolved, host]).toEqual(['memo-pack/memos', 'host/application']);

  // @ts-expect-error a hand-written ref isn't one
  const written: FeatureRef = 'memo-pack/memos';
  expect(written).toBe(resolved);

  // A ref still reads as the string it is
  const text: string = resolved;
  expect(text.startsWith('memo-pack/')).toBe(true);
});

it('keeps a hand-written string out of the host-only navigation', () => {
  // Typed only: calling it needs a bound frontend host
  const typed = (): void => {
    // @ts-expect-error navigation takes a resolved ref, not a string
    openRef('memo-pack/memos');
  };
  expect(typeof typed).toBe('function');
});

it('refuses a name with a slash that is no ref, rather than passing it on', () => {
  for (const name of ['a/b/c', '/notes', 'default-setup/']) {
    expect(() => resolveName(name, 'memo-pack')).toThrow(`"${name}" isn't a feature's ref`);
  }
});
