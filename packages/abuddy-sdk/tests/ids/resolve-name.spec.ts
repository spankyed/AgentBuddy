// How a name in pack code becomes the ref a system or plugin runs under. Every conversion calls this,
// so a name that belongs to no pack fails here, at the call, rather than as a send nobody receives.
import { describe, expect, it } from 'vitest';
import { resolveName, splitRef } from '../../src/ids/index.ts';

const inPack = { packId: 'memo-pack', hostIds: ['application'] };

describe('resolveName', () => {
  it("resolves a pack's own feature to its ref", () => {
    expect(resolveName('memos', inPack)).toBe('memo-pack/memos');
  });

  it("takes another pack's feature, named <pack>/<feature>, as it is", () => {
    expect(resolveName('default-setup/notes', inPack)).toBe('default-setup/notes');
  });

  // A pack could have a feature named after a host plugin; the bare id is the host's all the same
  it("leaves a host id bare, whatever pack is asking", () => {
    expect(resolveName('application', inPack)).toBe('application');
  });

  it('throws for a bare name with no pack to belong to, naming the form to write', () => {
    expect(() => resolveName('notes', { hostIds: ['application'] }))
      .toThrow('"notes" names no pack\'s feature: write "<packId>/notes"');
    expect(() => resolveName('notes')).toThrow('names no pack');
  });
});

describe('splitRef', () => {
  it('splits a ref into its pack and feature', () => {
    expect(splitRef('default-setup/notes')).toEqual({ packId: 'default-setup', featureId: 'notes' });
  });

  it("returns undefined for what isn't a ref: a bare id, or a malformed one", () => {
    expect(splitRef('application')).toBeUndefined();
    expect(splitRef('/notes')).toBeUndefined();
    expect(splitRef('default-setup/')).toBeUndefined();
    expect(splitRef('a/b/c')).toBeUndefined();
    expect(splitRef('default-setup.notes')).toBeUndefined();
  });
});
