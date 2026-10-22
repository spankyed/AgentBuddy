import type { Surface } from '@apackdev/sdk/fe';
import { HOST_PACK_ID, splitRef } from '@apackdev/sdk/ids';
import { getEligibleSurface, type ShellSurfaceCatalog } from './surface-selection.ts';
import type { SurfaceFrontendBinding } from './pack-store.ts';

/** Navigation metadata does not require a machine or a view to have loaded. */
export interface SurfaceNavigationItem {
  id: Surface['id'];
  label: string;
  icon?: Surface['icon'];
  isPinned?: boolean;
  visible: boolean;
  /** Whether this window accepted the surface's frontend; an unloaded tab opens through the shell's wait */
  loaded: boolean;
}

/** Catalog order and visibility are independent of frontend delivery; only accepted bindings supply icons. */
export function surfaceNavigationItems(
  catalog: ShellSurfaceCatalog,
  bindings: ReadonlyMap<string, SurfaceFrontendBinding>,
  visibility: Readonly<Record<string, boolean>>,
): SurfaceNavigationItem[] {
  const owners = catalog.surfaces().filter(owner => owner.origin !== 'source');
  const claims = new Map<string, number>();
  for (const owner of owners) claims.set(owner.featureRef, (claims.get(owner.featureRef) ?? 0) + 1);
  const items = owners.flatMap(owner => {
    if (owner.enabled !== true || claims.get(owner.featureRef) !== 1) return [];
    const declaration = owner.declaration;
    const accepted = getEligibleSurface(catalog, bindings, owner.featureRef);
    return [{ id: owner.featureRef, label: declaration.label,
      icon: accepted?.icon, loaded: accepted !== undefined,
      isPinned: declaration.isPinned,
      visible: visibility[owner.featureRef] ?? declaration.defaultVisible ?? true }];
  });
  const isHost = (item: SurfaceNavigationItem) => splitRef(item.id)?.packId === HOST_PACK_ID;
  const ordered = [...items.filter(item => !isHost(item)), ...items.filter(isHost)];
  return [...ordered.filter(item => !item.isPinned), ...ordered.filter(item => item.isPinned)];
}
