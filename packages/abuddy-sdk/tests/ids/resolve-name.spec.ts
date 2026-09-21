// How a name in pack code becomes the address a system or plugin runs under. Every conversion calls this,
// so a name that belongs to no pack fails here, at the call, rather than as a send nobody receives.
import { describe, expect, it } from 'vitest';
import { resolveName } from '../../src/ids/index.ts';

const inPack = { packId: 'memo-pack', hostIds: ['application'] };

describe('resolveName', () => {
  it("resolves a pack's own feature to its address", () => {
    expect(resolveName('memos', inPack)).toBe('memo-pack.memos');
  });

  it("resolves another pack's feature, named <pack>/<feature>", () => {
    expect(resolveName('default-setup/notes', inPack)).toBe('default-setup.notes');
  });

  // A pack could have a feature named after a host plugin; the bare id is the host's all the same
  it("leaves a host id bare, whatever pack is asking", () => {
    expect(resolveName('application', inPack)).toBe('application');
  });

  it('takes an address as it is', () => {
    expect(resolveName('default-setup.notes', inPack)).toBe('default-setup.notes');
  });

  it('throws for a bare name with no pack to belong to, naming the forms to write', () => {
    expect(() => resolveName('notes', { hostIds: ['application'] }))
      .toThrow('"notes" names no pack\'s feature: write "<packId>/notes", or the address "<packId>.notes"');
    expect(() => resolveName('notes')).toThrow('names no pack');
  });
});
