// Before 0.3.15 a plugin ran under its feature id and its settings were stored under it. The move puts each
// bare key a plugin's feature id stands for onto that plugin's address, and leaves everything else alone.
import { describe, expect, it } from 'vitest';
import { addressPluginSettings } from '../../src/framework/index.ts';
import { asHostAddress, resolveName } from '../../src/ids/index.ts';

const addresses = [resolveName('memo-pack/memos'), resolveName('memo-pack/board'), asHostAddress('application')];

const STORED = {
  memos: { sort: 'newest' },
  board: { columns: 3 },
  unknown: { kept: true },
  _meta: { visibility: { memos: false, board: true, unknown: false }, lastActivePlugin: 'memos', other: 1 },
};

describe('addressPluginSettings', () => {
  it("moves a plugin's slice, its visibility and the last-active plugin onto its address", () => {
    const { plugins, moved } = addressPluginSettings(STORED, addresses);
    expect(plugins).toEqual({
      'memo-pack.memos': { sort: 'newest' },
      'memo-pack.board': { columns: 3 },
      unknown: { kept: true },
      _meta: {
        visibility: { 'memo-pack.memos': false, 'memo-pack.board': true, unknown: false },
        lastActivePlugin: 'memo-pack.memos',
        other: 1,
      },
    });
    expect(moved).toBe(5);
  });

  it('changes nothing the second time', () => {
    const once = addressPluginSettings(STORED, addresses).plugins;
    const twice = addressPluginSettings(once, addresses);
    expect(twice.moved).toBe(0);
    expect(twice.plugins).toBe(once);
  });

  // On an upgrade, older migrations run first and already write to the address: what they wrote wins, and the
  // rest of the bare slice is kept under it
  it('merges a bare slice under what is already stored at the address', () => {
    const { plugins } = addressPluginSettings({
      memos: { sort: 'old', view: { columns: 2, dense: true }, pinned: ['a'] },
      'memo-pack.memos': { sort: 'new', view: { columns: 3 } },
      _meta: { visibility: { memos: false, 'memo-pack.memos': true } },
    }, addresses);
    expect(plugins).toEqual({
      'memo-pack.memos': { sort: 'new', view: { columns: 3, dense: true }, pinned: ['a'] },
      _meta: { visibility: { 'memo-pack.memos': true } },
    });
  });

  // Two packs with a feature of one name: nothing says which of them the bare key was stored for
  it('leaves a bare id two plugins share where it is', () => {
    const shared = [...addresses, resolveName('other-pack/memos')];
    const { plugins, moved } = addressPluginSettings({ memos: { sort: 'newest' }, board: {} }, shared);
    expect(plugins).toEqual({ memos: { sort: 'newest' }, 'memo-pack.board': {} });
    expect(moved).toBe(1);
  });

  it('leaves a host plugin, and the last-active plugin when it names none of them, bare', () => {
    const stored = { application: { a: 1 }, _meta: { lastActivePlugin: 'application' } };
    expect(addressPluginSettings(stored, addresses)).toEqual({ plugins: stored, moved: 0 });
  });
});
