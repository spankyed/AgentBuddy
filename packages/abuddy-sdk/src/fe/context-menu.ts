import type { Component } from 'vue';

export interface ContextMenuItem {
  label: string;
  icon?: Component;
  iconColor?: string;
  event: { type: string; [key: string]: unknown };
  separator?: boolean;
  isActive?: boolean;
  confirm?: string;
}

export type ContextMenuMeta =
  | ContextMenuItem[]
  // `never`: the host passes the machine's own context, which each menu function types itself
  | ((context: never) => ContextMenuItem[]);

export function contextMenu(items: ContextMenuItem[]) {
  return { contextMenu: items };
}

export function contextMenuFn<C>(getItems: (ctx: C) => ContextMenuItem[]) {
  return { contextMenu: getItems } as const;
}
