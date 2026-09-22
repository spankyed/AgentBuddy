// Before 0.3.15 a plugin ran under its feature id, and records keyed by plugin (its settings, the sidebar
// visibility) were stored under it. The move puts each bare key a plugin's feature id stands for onto that
// plugin's ref, and leaves everything else alone.
import { describe, expect, it } from 'vitest';
import { addressPluginKeys, pluginRefOf } from '../../src/framework/index.ts';
import { resolveName } from '../../src/ids/index.ts';

const refs = [resolveName('memo-pack/memos'), resolveName('memo-pack/board'), resolveName('host/packs')];
/** Those plugins, with no built-in pack among them */
const owners = { refs, builtIn: [] };
const withOther = { refs: [...refs, resolveName('other-pack/memos')], builtIn: [] };

describe('addressPluginKeys', () => {
  it("moves each key a plugin's feature id stands for onto its ref, the host's included", () => {
    const { record, moved } = addressPluginKeys({ memos: { sort: 'newest' }, packs: false, unknown: { kept: true } }, owners);
    expect(record).toEqual({ 'memo-pack/memos': { sort: 'newest' }, 'host/packs': false, unknown: { kept: true } });
    expect(moved).toBe(2);
  });

  it('changes nothing the second time', () => {
    const once = addressPluginKeys({ memos: {}, board: {} }, owners).record;
    const twice = addressPluginKeys(once, owners);
    expect(twice.moved).toBe(0);
    expect(twice.record).toBe(once);
  });

  // On an upgrade, older migrations run first and already write to the ref: what they wrote wins, and the
  // rest of the bare slice is kept under it
  it('merges a bare value under what is already stored at the ref', () => {
    const { record } = addressPluginKeys({
      memos: { sort: 'old', view: { columns: 2, dense: true }, pinned: ['a'] },
      'memo-pack/memos': { sort: 'new', view: { columns: 3 } },
    }, owners);
    expect(record).toEqual({ 'memo-pack/memos': { sort: 'new', view: { columns: 3, dense: true }, pinned: ['a'] } });
  });

  // Two packs with a feature of one name: nothing says which of them the bare key was stored for
  it('leaves a bare id two plugins share where it is', () => {
    const { record, moved } = addressPluginKeys({ memos: { sort: 'newest' }, board: {} }, withOther);
    expect(record).toEqual({ memos: { sort: 'newest' }, 'memo-pack/board': {} });
    expect(moved).toBe(1);
  });

  // Before 0.3.15 a built-in pack registered first, so the plugin running under a shared bare id was the built-in one
  it("gives a bare id a built-in pack shares with another pack to the built-in pack's plugin", () => {
    const { record } = addressPluginKeys({ memos: { sort: 'newest' } }, { ...withOther, builtIn: ['other-pack'] });
    expect(record).toEqual({ 'other-pack/memos': { sort: 'newest' } });
  });

  it('moves only the keys `movesTo` takes, told whether a built-in pack owns them', () => {
    const { record, moved } = addressPluginKeys({ memos: {}, packs: false }, { refs, builtIn: ['memo-pack'], movesTo: (_ref, { builtIn }) => !builtIn });
    expect(record).toEqual({ memos: {}, 'host/packs': false });
    expect(moved).toBe(1);
  });
});

describe('pluginRefOf', () => {
  it('is a ref among them, or the one plugin a bare id stands for', () => {
    expect(pluginRefOf('memo-pack/memos', owners)).toBe('memo-pack/memos');
    expect(pluginRefOf('packs', owners)).toBe('host/packs');
  });

  it('is undefined for an id naming none of them, or one two of them share', () => {
    expect(pluginRefOf('other', owners)).toBeUndefined();
    expect(pluginRefOf('memos', withOther)).toBeUndefined();
  });
});
