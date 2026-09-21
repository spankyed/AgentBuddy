// How a name in pack code becomes the ref a system or plugin runs under. Every conversion calls this,
// so a name that belongs to no pack fails here, at the call, rather than as a send nobody receives.
import { describe, expect, it } from 'vitest';
import { resolveName, splitRef } from '../../src/ids/index.ts';

describe('resolveName', () => {
  it("resolves a pack's own feature to its ref", () => {
    expect(resolveName('memos', 'memo-pack')).toBe('memo-pack/memos');
  });

  it('takes any other feature, the host\'s too, named <pack>/<feature>, as it is', () => {
    expect(resolveName('default-setup/notes', 'memo-pack')).toBe('default-setup/notes');
    expect(resolveName('host/application', 'memo-pack')).toBe('host/application');
  });

  // The host is a pack like any other, so a bare name is always the writing pack's own
  it("resolves a bare name that is also a host feature's to the writing pack's own", () => {
    expect(resolveName('application', 'memo-pack')).toBe('memo-pack/application');
  });

  it('throws for a bare name with no pack to belong to, naming the form to write', () => {
    expect(() => resolveName('notes')).toThrow('"notes" names no pack\'s feature: write "<packId>/notes"');
  });
});

describe('splitRef', () => {
  it('splits a ref into its pack and feature', () => {
    expect(splitRef('default-setup/notes')).toEqual({ packId: 'default-setup', featureId: 'notes' });
  });

  it("returns undefined for what isn't a ref: a bare name, or a malformed one", () => {
    expect(splitRef('application')).toBeUndefined();
    expect(splitRef('/notes')).toBeUndefined();
    expect(splitRef('default-setup/')).toBeUndefined();
    expect(splitRef('a/b/c')).toBeUndefined();
    expect(splitRef('default-setup.notes')).toBeUndefined();
  });
});
