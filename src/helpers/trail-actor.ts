import type { AnyActor, AnyMachineSnapshot } from "xstate";

export interface BreadcrumbItem {
  label: string;
  target: string;
}

export type UpdateData = {
  crumbs: BreadcrumbItem[];
  target?: string;
}

export function computeCrumbs(state: AnyMachineSnapshot): UpdateData {
  let crumbs = state._nodes.slice(1).map((node) => ({
    id: node.id,
    label: node.meta?.breadcrumb?.label,
    target: node.meta?.breadcrumb?.target,
  }))
  const defaultState = Object.values(state.machine.states).find((state) => state.meta?.breadcrumb?.default);
  if (defaultState?.id === crumbs[0]?.id) {
    crumbs = crumbs.slice(1);

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
