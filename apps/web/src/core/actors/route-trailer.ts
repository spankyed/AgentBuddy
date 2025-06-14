import type { AnyActor, AnyMachineSnapshot, EventObject, MachineContext, MetaObject, ParameterizedObject, ProvidedActor, TransitionConfigOrTarget } from "xstate";
import { safeEvents } from "@/core/types/safe-events";
import { capitalizeFirstLetter } from "../utils";

export interface BreadcrumbItem {
  label: string;
  target: string;
  info?: any; // Optional info property for additional data
}

export type BreadcrumbMeta = BreadcrumbItem | BreadcrumbItem[] | ((context: any) => BreadcrumbItem | BreadcrumbItem[]);

export type UpdateData = {
  crumbs: BreadcrumbItem[];
  target?: string;
}

export function computeCrumbs(state: AnyMachineSnapshot): UpdateData {
  const allCrumbs: BreadcrumbItem[] = [];
  
  // Process nodes starting from index 1 (skip root) (top level states only)
  state._nodes.slice(1).forEach((node) => {
    const breadcrumbMeta = node.meta?.breadcrumb as BreadcrumbMeta | undefined;
    if (!breadcrumbMeta) {
      // Keep the existing behavior of including undefined items
      allCrumbs.push({ label: undefined as any, target: undefined as any });
      return;
    }
    
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
  });

  // Handle default state when no crumbs
  const defaultState = Object.values(state.machine.states).find((s) => {
    const breadcrumb = s.meta?.breadcrumb;
    const breadcrumbItem = typeof breadcrumb === 'function' ? breadcrumb(state.context) : breadcrumb;
    // Check if it's a single item with default property
    return !Array.isArray(breadcrumbItem) && breadcrumbItem?.default;
  });

  if (!allCrumbs.length) {
    allCrumbs.push({
      label: capitalizeFirstLetter(state.machine.id),
      target: state.machine.config.initial as string,
    });
  }

  const lastTarget = allCrumbs[allCrumbs.length - 1]?.target;

  return { crumbs: allCrumbs, target: lastTarget };
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