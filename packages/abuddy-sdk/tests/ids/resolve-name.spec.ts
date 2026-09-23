// How a name in pack code becomes the ref a system or plugin runs under. Every conversion calls this,
// so a name that belongs to no pack fails here, at the call, rather than as a send nobody receives.
import { describe, expect, it } from 'vitest';
import { refProblem, resolveName, resolveRegistered, splitRef } from '../../src/ids/index.ts';

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

  // What it makes is a ref splitRef reads back, or nothing
  it('throws for a name or pack id that makes no ref', () => {
    for (const [name, packId] of [['', 'memo-pack'], ['a.b', 'memo-pack'], ['my-feature', 'memo-pack'], ['notes', 'Memo_Pack']]) {
      expect(() => resolveName(name, packId), `${packId}/${name}`).toThrow("isn't a feature's ref");
    }
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
    expect(splitRef('default-setup/a.b')).toBeUndefined();
    expect(splitRef('Default_Setup/notes')).toBeUndefined();
    // A popout's URL carries a plugin's ref, which main checks with this
    for (const ref of ['', '../x', 'a b/notes', 'default-setup/notes?x=1']) expect(splitRef(ref), ref).toBeUndefined();
  });
});

// The harness and services.emitter both turn a name into a registered feature through this, so a mistake reads the
// same everywhere: the form to write, the feature it probably meant, and what is registered
describe('resolveRegistered', () => {
  const registered = ['memo-pack/memos', 'default-setup/threads', 'host/application'];

  it('resolves a name in its pack, or a ref with none, to a registered feature', () => {
    expect(resolveRegistered('plugin', 'memos', { packId: 'memo-pack', registered })).toBe('memo-pack/memos');
    expect(resolveRegistered('plugin', 'host/application', { registered })).toBe('host/application');
  });

  it("throws for what isn't registered, naming the ref it would be and the feature it probably meant", () => {
    expect(() => resolveRegistered('plugin', 'threads', { packId: 'memo-pack', registered }))
      .toThrow('No registered plugin is named "threads" (it would be "memo-pack/threads"): name this pack\'s own plugins by feature id and another pack\'s as "<packId>/<featureId>" — did you mean "default-setup/threads"? Registered: memo-pack/memos, default-setup/threads, host/application');
    expect(() => resolveRegistered('system', 'threads', { registered, form: 'actions name a system "<packId>/<featureId>"' }))
      .toThrow('No registered system is named "threads": actions name a system "<packId>/<featureId>" — did you mean "default-setup/threads"?');
  });
});

// The same lookup, reported rather than thrown, for code that collects every problem (a settings document's keys)
describe('refProblem', () => {
  const installed = ['memo-pack/memos', 'default-setup/threads'];

  it('is undefined for a name that stands for one of the refs', () => {
    expect(refProblem('plugin', 'memos', { packId: 'memo-pack', registered: installed })).toBeUndefined();
    expect(refProblem('plugin', 'default-setup/threads', { registered: installed })).toBeUndefined();
  });

  it('names the refs by what they are among, and the one a name probably meant', () => {
    expect(refProblem('feature with settings', 'threads', { registered: installed, among: 'installed' })).toBe(
      'No installed feature with settings is named "threads": name a feature with settings as "<packId>/<featureId>"'
      + ' — did you mean "default-setup/threads"? Installed: memo-pack/memos, default-setup/threads',
    );
  });

  it("reports a name that can't be a ref, rather than throwing", () => {
    expect(refProblem('plugin', 'Not An Id', { packId: 'memo-pack', registered: installed })).toContain(`isn't a feature's ref`);
  });
});

