import { afterEach, describe, expect, it, vi } from 'vitest';
import { _declarationRevision, PACK_SNAPSHOT_FORMAT } from '@apackdev/sdk/build';
import { createContributionCatalog } from '../../src/packs/catalog.ts';
import type { PackCatalogFrame } from '../../src/packs/catalog.ts';
import { createWindowPackCatalog } from '../../src/fe/pack-catalog.ts';

afterEach(() => vi.useRealTimers());

function fixture() {
  const sessions: { receive(frame: PackCatalogFrame): void; failed(error: unknown): void; stop: ReturnType<typeof vi.fn> }[] = [];
  const reader = createWindowPackCatalog({ subscribe(receive, failed) {
    const session = { receive, failed, stop: vi.fn() }; sessions.push(session); return session.stop;
  } });
  const catalog = createContributionCatalog({ schema: { type: 'object' }, defaults: {} });
  const wire = (runId = 'first-run'): PackCatalogFrame => JSON.parse(JSON.stringify({ runId, snapshot: catalog.getSnapshot() }));
  return { reader, catalog, sessions, wire };
}

describe('window declaration catalog', () => {
  it('accepts data without executable registration and keeps an immutable owned snapshot', () => {
    const { reader, catalog, sessions, wire } = fixture();
    catalog.setNative([{ id: 'native-pack', features: { view: { description: 'Feature declaration fixture.', plugin: { label: 'Cold', state: 'src/state.ts' } } } }]);
    reader.connect();
    const frame = wire(); sessions[0].receive(frame);
    expect(reader.status()).toBe('ready');
    expect(reader.getSnapshot()?.native[0].features?.view.plugin?.label).toBe('Cold');
    (frame.snapshot.native[0] as { id: string }).id = 'changed';
    expect(reader.getSnapshot()?.native[0].id).toBe('native-pack');
    expect(Reflect.set(reader.getSnapshot()!, 'revision', 900)).toBe(false);
  });

  it('projects native, disabled installed and source declarations with truthful identities and stable entries', () => {
    const { reader, catalog, sessions, wire } = fixture();
    const references = { types: { memo: { category: 'memos', icon: 'NotebookText', svgElements: [], navigate: 'never.ts#open' } },
      categories: { memos: { label: 'Memos', icon: 'NotebookText', useItems: 'never.ts#useItems' } } };
    catalog.setNative([{ id: 'native-pack', features: { memos: { description: 'Feature declaration fixture.', references } } }]);
    const manifest = { id: 'source-pack', name: 'Source', version: '1.0.0', features: { memos: { description: 'Feature declaration fixture.', references } } };
    catalog.setSources([{ dir: '/isolated/source', manifest, declarationRevision: _declarationRevision(manifest) }]);
    const installed = { ...manifest, id: 'installed-pack' };
    catalog.replace([{ dir: '/isolated/installed', enabled: false, snapshot: {
      format: PACK_SNAPSHOT_FORMAT, declarationRevision: _declarationRevision(installed), manifest: installed,
      types: { entities: {}, relKinds: {} }, defs: {},
    } }]);
    reader.connect(); sessions[0].receive(wire());
    const entries = reader.catalog.references();
    expect(entries).toMatchObject([
      { featureRef: 'native-pack/memos', origin: 'native', enabled: true },
      { featureRef: 'installed-pack/memos', origin: 'installed', enabled: false, declarationRevision: _declarationRevision(installed) },
      { featureRef: 'source-pack/memos', origin: 'source', declarationRevision: _declarationRevision(manifest) },
    ]);
    expect(entries[0]).not.toHaveProperty('artifactRevision');
    expect(entries[2]).not.toHaveProperty('enabled');
    expect(reader.catalog.references()).toBe(entries);
    reader.disconnect();
    expect(reader.catalog.references()).toBe(entries);
    expect(reader.catalog.status()).toBe('disconnected');
    expect(Reflect.set(entries[0].declaration.categories.memos, 'label', 'changed')).toBe(false);
    reader.dispose();
  });

  it('does not invoke observers added during the current publication', () => {
    const { reader, sessions, wire } = fixture(); const next = vi.fn();
    reader.catalog.subscribe(() => { reader.catalog.subscribe(next); });
    reader.connect();
    expect(next).not.toHaveBeenCalled();
    sessions[0].receive(wire());
    expect(next).toHaveBeenCalledOnce(); reader.dispose();
  });

  it('accepts newer revisions and ignores older frames', () => {
    const { reader, catalog, sessions, wire } = fixture(); reader.connect();
    const first = wire(); sessions[0].receive(first);
    catalog.setNative([{ id: 'native-pack' }]); sessions[0].receive(wire());
    sessions[0].receive(first);
    expect(reader.getSnapshot()?.native).toEqual([{ id: 'native-pack' }]);
  });

  it('refuses conflicting data at one revision while retaining the accepted snapshot', () => {
    const { reader, sessions, wire } = fixture(); reader.connect(); sessions[0].receive(wire());
    const conflict = wire(); (conflict.snapshot.native as unknown[]).push({ id: 'ghost' }); sessions[0].receive(conflict);
    expect(reader.status()).toBe('error');
    expect(reader.problem()).toContain('without a catalog revision');
    expect(reader.getSnapshot()?.native).toEqual([]);
    expect(sessions[0].stop).toHaveBeenCalledOnce();
  });

  it('isolates connection epochs and permits a restarted backend to begin at revision zero', () => {
    const { reader, catalog, sessions, wire } = fixture(); reader.connect();
    catalog.setNative([{ id: 'old-pack' }]); sessions[0].receive(wire()); reader.disconnect();
    catalog.setNative([]); reader.connect();
    const fresh = wire('new-run'); (fresh.snapshot as { revision: number }).revision = 0;
    sessions[1].receive(fresh); sessions[0].receive(wire()); sessions[0].failed(new Error('late failure'));
    expect(reader.status()).toBe('ready'); expect(reader.getSnapshot()?.revision).toBe(0);
    expect(reader.getSnapshot()?.native).toEqual([]);
    expect(sessions[0].stop).toHaveBeenCalledOnce();
  });

  it('refuses a different backend identity inside an established connection', () => {
    const { reader, sessions, wire } = fixture(); reader.connect(); sessions[0].receive(wire()); sessions[0].receive(wire('other-run'));
    expect(reader.status()).toBe('error'); expect(reader.problem()).toContain('backend changed');
  });

  it('handles synchronous data and cancellation during subscription setup', () => {
    const { wire } = fixture(); const stop = vi.fn();
    const reader = createWindowPackCatalog({ subscribe(receive) { receive(wire()); return stop; } });
    reader.subscribe(() => reader.disconnect()); reader.connect();
    expect(reader.status()).toBe('disconnected'); expect(stop).toHaveBeenCalledOnce();
    reader.dispose(); expect(() => reader.connect()).toThrow('disposed');
  });

  it('times out a subscription that never supplies its initial catalog and closes late callbacks', () => {
    vi.useFakeTimers();
    const { reader, sessions, wire } = fixture(); reader.connect();
    vi.advanceTimersByTime(30_000);
    expect(reader.status()).toBe('error');
    expect(reader.problem()).toContain('did not provide');
    expect(sessions[0].stop).toHaveBeenCalledOnce();
    sessions[0].receive(wire());
    expect(reader.getSnapshot()).toBeUndefined();
    reader.dispose();
  });

  it('cleans up an immediately failed subscription exactly once', () => {
    const stop = vi.fn();
    const reader = createWindowPackCatalog({ subscribe(_receive, failed) { failed(new Error('failed')); return stop; } });
    reader.connect();
    expect(reader.status()).toBe('error'); expect(stop).toHaveBeenCalledOnce(); reader.dispose();
    expect(stop).toHaveBeenCalledOnce();
  });

  it.each([NaN, -1, 1.2])('refuses invalid wire revisions (%s)', revision => {
    const { reader, sessions, wire } = fixture(); reader.connect();
    const malformed = wire(); (malformed.snapshot as { revision: number }).revision = revision;
    sessions[0].receive(malformed);
    expect(reader.status()).toBe('error'); expect(reader.getSnapshot()).toBeUndefined();
    reader.dispose();
  });

  it('contains a failed observer and disposes subscription callbacks', () => {
    const { reader, sessions, wire } = fixture(); const observed = vi.fn();
    reader.subscribe(() => { throw new Error('bad observer'); }); reader.subscribe(observed);
    reader.connect(); sessions[0].receive(wire());
    expect(reader.status()).toBe('ready'); expect(observed).toHaveBeenCalled();
    reader.dispose(); sessions[0].receive(wire());
    expect(reader.status()).toBe('disposed'); expect(reader.getSnapshot()).toBeUndefined();
  });
});
