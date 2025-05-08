import { type AnyActor, type AnyMachineSnapshot, fromCallback } from "xstate";

export interface BreadcrumbItem {
  label: string;
  target: string;
}

export type UpdateData = {
  crumbs: BreadcrumbItem[];
  target: string;
}

function computeCrumbs(state: AnyMachineSnapshot): BreadcrumbItem[] {
  let crumbs = state._nodes.slice(1).map((node) => ({
    id: node.id,
    label: node.meta?.breadcrumb?.label,
    target: node.meta?.breadcrumb?.target,
  }))
  const defaultState = Object.values(state.machine.states).find((state) => state.meta?.breadcrumb?.default);
  if (defaultState?.id === crumbs[0]?.id) {
    crumbs = crumbs.slice(1);

    if (!crumbs.length) {
      return [];
    }
  }

  return [
    defaultState?.meta?.breadcrumb,
    ...crumbs,
  ].map(({ label, target }) => ({ label, target }));
}

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
export default function trailActor(actor: AnyActor, onStateChange: (data: UpdateData) => any) {
  let prevSnapshot: AnyMachineSnapshot | undefined;

  return actor.subscribe((snapshot: AnyMachineSnapshot) => {
    if (snapshot === prevSnapshot) {
      return;
    }

    const crumbs = computeCrumbs(snapshot);
    const target = crumbs[crumbs.length - 1]?.target; 

    onStateChange({ crumbs, target });
    prevSnapshot = snapshot;
  }).unsubscribe;
}
