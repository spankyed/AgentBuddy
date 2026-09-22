// The breadcrumbs and context menu of the plugin open: read off its state machine's `meta` (`breadcrumb`,
// `contextMenu`) each time its state changes, by a child actor that follows whichever plugin is open.
import { fromCallback, type AnyActorRef, type AnyMachineSnapshot } from 'xstate';
import type { ContextMenuItem, ContextMenuMeta } from '@abuddy/sdk/fe';
import { HOST } from '../../../refs.ts';

const capitalizeFirstLetter = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export interface BreadcrumbItem {
  label: string;
  target: string;
  /** What a click on the crumb hands the plugin with its target */
  info?: unknown;
}

export type BreadcrumbMeta = BreadcrumbItem | BreadcrumbItem[] | ((context: unknown) => BreadcrumbItem | BreadcrumbItem[]);

export type UpdateData = {
  crumbs: BreadcrumbItem[];
  target?: string;
  menuItems: ContextMenuItem[];
}

function resolveMenuItems(meta: ContextMenuMeta | undefined, ctx: unknown): ContextMenuItem[] {
  if (!meta) return [];
  // A menu function types the context of the machine it's declared in
  return typeof meta === 'function' ? (meta as (context: unknown) => ContextMenuItem[])(ctx) : meta;
}

export function computeCrumbs(state: AnyMachineSnapshot): UpdateData {
  const allCrumbs: BreadcrumbItem[] = [];

  // Process nodes starting from index 1 (skip root) (top level states only)
  const activeState = state._nodes.slice(1)?.[0];
  const breadcrumbMeta = activeState?.meta?.breadcrumb as BreadcrumbMeta | undefined;
  if (breadcrumbMeta) {
    // Resolve breadcrumb (could be function or value)
    const breadcrumbResult = typeof breadcrumbMeta === 'function'
      ? breadcrumbMeta(state.context)
      : breadcrumbMeta;

    // Handle both single items and arrays
    if (Array.isArray(breadcrumbResult)) {
      allCrumbs.push(...breadcrumbResult);
    } else {
      allCrumbs.push(breadcrumbResult);
    }
  }

  // Handle default state when no crumbs
  const defaultState = Object.values(state.machine.states).find((s) => {
    const breadcrumb = s.meta?.breadcrumb;
    const breadcrumbItem = typeof breadcrumb === 'function' ? breadcrumb(state.context) : breadcrumb;
    // Check if it's a single item with default property
    return !Array.isArray(breadcrumbItem) && breadcrumbItem?.default;
  });

  if (defaultState && defaultState?.key !== state.value) {
    allCrumbs.unshift(defaultState?.meta?.breadcrumb as BreadcrumbItem);
  } else if (!defaultState) {
    // Check root node meta for a machine-level default breadcrumb
    const rootBreadcrumb = state._nodes[0]?.meta?.breadcrumb;
    const rootItem = typeof rootBreadcrumb === 'function' ? rootBreadcrumb(state.context) : rootBreadcrumb;
    if (!Array.isArray(rootItem) && rootItem?.default) {
      // Only prepend if current active state is different (avoid duplicating when on the default view)
      const activeKey = activeState?.key;
      if (activeKey !== rootItem.target) {
        allCrumbs.unshift(rootItem);
      } else if (!allCrumbs.length) {
        // We're on the default view itself — use root breadcrumb as the sole crumb
        allCrumbs.push(rootItem);
      }
    } else if (!allCrumbs.length) {
      allCrumbs.push({
        label: capitalizeFirstLetter(state.machine.id),
        target: state.machine.config.initial as string,
      });
    }
  }

  const lastTarget = allCrumbs[allCrumbs.length - 1]?.target;

  // Extract context menu items
  const rootMenuMeta = state._nodes[0]?.meta?.contextMenu as ContextMenuMeta | undefined;
  const stateMenuMeta = activeState?.meta?.contextMenu as ContextMenuMeta | undefined;

  const rootItems = resolveMenuItems(rootMenuMeta, state.context);
  const stateItems = resolveMenuItems(stateMenuMeta, state.context);

  // Merge: root items first, auto-add separator to first state item if root items exist
  let menuItems: ContextMenuItem[];
  if (rootItems.length > 0 && stateItems.length > 0) {
    const stateWithSep = stateItems.map((item, i) =>
      i === 0 && !item.separator ? { ...item, separator: true } : item
    );
    menuItems = [...rootItems, ...stateWithSep];
  } else {
    menuItems = [...rootItems, ...stateItems];
  }

  return { crumbs: allCrumbs, target: lastTarget, menuItems };
}

/** Reports `actor`'s breadcrumbs now and on each change of its state; returns the unsubscribe */
function trail(actor: AnyActorRef, onStateChange: (data: UpdateData) => void): () => void {
  let prevSnapshot: AnyMachineSnapshot | undefined;
  onStateChange(computeCrumbs(actor.getSnapshot()));
  return actor.subscribe((snapshot: AnyMachineSnapshot) => {
    if (snapshot === prevSnapshot) return;
    onStateChange(computeCrumbs(snapshot));
    prevSnapshot = snapshot;
  }).unsubscribe;
}

/** Follows the plugin at the ref it starts with, and the one each `TRAIL_NEW_PLUGIN` names, sending the shell its crumbs */
export const pluginTrailer = fromCallback<{ type: 'TRAIL_NEW_PLUGIN'; id: string }, string>(({ system, receive, input: id }) => {
  const onStateChange = ({ crumbs, target, menuItems }: UpdateData) =>
    system.get(HOST.application).send({ type: 'TRAIL_UPDATE', crumbs, target, menuItems });

  const initial = system.get(id);
  let unsubscribe = initial ? trail(initial, onStateChange) : () => {};

  receive((event) => {
    if (event.type === 'TRAIL_NEW_PLUGIN') {
      unsubscribe();
      const plugin = system.get(event.id);
      unsubscribe = plugin ? trail(plugin, onStateChange) : () => {};
    }
  });

  return () => unsubscribe();
});
