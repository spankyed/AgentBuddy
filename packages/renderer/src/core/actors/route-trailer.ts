import type { AnyActor, AnyMachineSnapshot, EventObject, MachineContext, MetaObject, ParameterizedObject, ProvidedActor, TransitionConfigOrTarget } from "xstate";
import { safeEvents } from "@/core/types/safe-events";
import { capitalizeFirstLetter } from "../utils";
import Label from '@/core/components/design/label.vue';
import type { ContextMenuItem, ContextMenuMeta } from '@/core/context-menu';

export interface BreadcrumbItem {
  label: string;
  target: string;
  info?: any; // Optional info property for additional data
}

export type BreadcrumbMeta = BreadcrumbItem | BreadcrumbItem[] | ((context: any) => BreadcrumbItem | BreadcrumbItem[]);

export type UpdateData = {
  crumbs: BreadcrumbItem[];
  target?: string;
  menuItems: ContextMenuItem[];
}

function resolveMenuItems(meta: ContextMenuMeta | undefined, ctx: any): ContextMenuItem[] {
  if (!meta) return [];
  return typeof meta === 'function' ? meta(ctx) : meta;
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

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
export default function trailActor(actor: AnyActor, onStateChange: (data: UpdateData) => any) {
  let prevSnapshot: AnyMachineSnapshot | undefined;

  onStateChange(computeCrumbs(actor.getSnapshot()));

  return actor.subscribe((snapshot: AnyMachineSnapshot) => {
    if (snapshot === prevSnapshot) {
      return;
    }

    onStateChange(computeCrumbs(snapshot));
    prevSnapshot = snapshot;
  }).unsubscribe;
}

// Helpers
export type TrailClickEvent = { type: 'TRAIL_CLICK'; target: string };
const typeOf = safeEvents<TrailClickEvent>();
// biome-ignore lint/suspicious/noExplicitAny: <explanation>
export const targetIs = ({ event }: any, params: { view: string }) => typeOf('TRAIL_CLICK', event).target === params.view

type RouteTuple = [string, string];
type TransitionConfig = TransitionConfigOrTarget<MachineContext, EventObject, EventObject, ProvidedActor, ParameterizedObject, ParameterizedObject, string, EventObject, MetaObject>
export function TRAIL_CLICK<T extends TransitionConfig>(routes: RouteTuple[]) {
  return {
    ['TRAIL_CLICK' as keyof T]: routes.map(([target, view]) => ({
      guard: { type: 'targetIs', params: { view } },
      target,
    }))
  }
}