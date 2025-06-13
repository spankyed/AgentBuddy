import type { AnyActor, AnyMachineSnapshot, EventObject, MachineContext, MetaObject, ParameterizedObject, ProvidedActor, TransitionConfigOrTarget } from "xstate";
import { safeEvents } from "@/core/types/safe-events";

export interface BreadcrumbItem {
  label: string;
  target: string;
}

export type UpdateData = {
  crumbs: BreadcrumbItem[];
  target?: string;
}

export function computeCrumbs(state: AnyMachineSnapshot): UpdateData {
  let crumbs = state._nodes.slice(1).map((node) => {
    const breadcrumb = node.meta?.breadcrumb;
    const breadcrumbItem = typeof breadcrumb === 'function' ? breadcrumb(state.context) : breadcrumb;
    return {
      id: node.id,
      label: breadcrumbItem?.label,
      target: breadcrumbItem?.target,
    };
  });

  const defaultState = Object.values(state.machine.states).find((s) => {
    const breadcrumb = s.meta?.breadcrumb;
    const breadcrumbItem = typeof breadcrumb === 'function' ? breadcrumb(state.context) : breadcrumb;
    return breadcrumbItem?.default;
  });

  if (defaultState?.id === crumbs[0]?.id) {
    crumbs = crumbs.slice(1);

    // ? comment out this to show the default breadcrumb
    if (!crumbs.length) {
      return { crumbs: [], target: undefined };
    }
  }

  const breadcrumbs = [
    defaultState?.meta?.breadcrumb,
    ...crumbs,
  ].map(({ label, target }) => ({ label, target }));

  const target = breadcrumbs[breadcrumbs.length - 1]?.target;

  return { crumbs: breadcrumbs, target };
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