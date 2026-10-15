import { afterEach, describe, expect, it, vi } from 'vitest';
import { bindFeHost, unbindFeHost } from '../../src/runtime/fe-host.ts';
import { getReferenceDeclarations, getReferenceCatalogStatus, onReferenceDeclarationsChanged,
  getReferenceTypeDeclaration, getReferenceCategoryDeclarations } from '../../src/fe/reference-types.ts';
import type { PackCatalogView, ReferenceCatalogEntry } from '../../src/framework/catalog-view.ts';
import { resolveName } from '../../src/ids/refs.ts';

afterEach(() => unbindFeHost());

describe('frontend reference declaration access', () => {
  it('reads disabled metadata from the declaration catalog without consulting executable lookups', () => {
    const declarations: ReferenceCatalogEntry[] = [{ packId: 'cold-pack', featureRef: resolveName('notes', 'cold-pack'),
      origin: 'installed', enabled: false, declarationRevision: 'decl', buildRevision: 'build', declaration: {
        types: { note: { category: 'notes', icon: 'NotebookText', svgElements: [], navigate: 'never-execute.ts#open' } },
        categories: { notes: { label: 'Cold Notes', icon: 'NotebookText', useItems: 'never-execute.ts#useItems' } },
      } }];
    const catalog: PackCatalogView = { status: () => 'ready', problem: () => undefined, frontend: () => [], references: () => declarations, subscribe: () => () => {} };
    const forbidden = new Proxy({}, { get() { throw new Error('Do not activate or read executable registrations'); } });
    bindFeHost({ catalog, packs: forbidden as never, application: forbidden as never, client: forbidden as never, secrets: forbidden as never, settings: forbidden as never });
    expect(getReferenceDeclarations()).toBe(declarations);
    expect(getReferenceCatalogStatus()).toBe('ready');
    expect(getReferenceTypeDeclaration('note')).toBe(declarations[0].declaration.types.note);
    expect(getReferenceCategoryDeclarations()).toMatchObject([{ id: 'notes', featureRef: 'cold-pack/notes' }]);
  });

  it('subscribes to window declaration changes and exposes unavailable status independently of retained data', () => {
    const listeners = new Set<() => void>();
    const catalog: PackCatalogView = { status: () => 'disconnected', problem: () => undefined, frontend: () => [], references: () => [],
      subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; } };
    bindFeHost({ catalog, packs: {} as never, application: {} as never, client: {} as never, secrets: {} as never, settings: {} as never });
    const changed = vi.fn(); const stop = onReferenceDeclarationsChanged(changed);
    for (const listener of listeners) listener();
    expect(changed).toHaveBeenCalledOnce(); expect(getReferenceCatalogStatus()).toBe('disconnected');
    stop(); expect(listeners.size).toBe(0);
  });
});
