/** A component module; loading mode changes execution, never discovery. */
export type ComponentTarget = string | { entry: string; load?: 'lazy' };

/** Plugin data known before its machine, views or predicates execute. */
export interface PluginDeclaration {
  label: string;
  state: string;
  icon?: string | { entry: string; load?: 'lazy' };
  canvas?: ComponentTarget | { routes: Record<string, ComponentTarget> };
  panel?: ComponentTarget;
  chat?: ComponentTarget;
  isPinned?: boolean;
  hotkeys?: readonly { action: string; global?: boolean }[];
  options?: { headerClass?: string };
  fallbackPanel?: { label: string; toggle: { type: string }; isShown: string };
  contract?: string;
  default?: boolean;
  defaultVisible?: boolean;
}

/** @internal File/export targets named by a plugin, for validation and source freshness. */
export function _pluginTargets(plugin: PluginDeclaration): [string, string][] {
  const component = (field: string, target: ComponentTarget | undefined): [string, string][] =>
    target === undefined ? [] : [[field, typeof target === 'string' ? target : target.entry]];
  const canvas = plugin.canvas;
  return [
    ['state', plugin.state],
    ...component('icon', typeof plugin.icon === 'object' ? plugin.icon : undefined),
    ...(canvas && typeof canvas === 'object' && 'routes' in canvas
      ? Object.entries(canvas.routes).flatMap(([route, target]) => component(`canvas.routes.${route}`, target))
      : component('canvas', canvas)),
    ...component('panel', plugin.panel), ...component('chat', plugin.chat),
    ...(plugin.fallbackPanel ? [['fallbackPanel.isShown', plugin.fallbackPanel.isShown] as [string, string]] : []),
  ];
}


/** @internal Check compiled destination data without importing contracts or machines. */
export function _entityDestinationsProblem(destinations: Readonly<Record<string, string>>,
  features: Readonly<Record<string, { readonly plugin?: unknown }>> | undefined, entities?: ReadonlySet<string>): string | undefined {
  for (const [entity, feature] of Object.entries(destinations)) {
    if (!Object.hasOwn(features ?? {}, feature) || !features![feature].plugin) {
      return `Entity destination "${entity}" names feature "${feature}" without a declared plugin`;
    }
    if (entities && !entities.has(entity)) return `Entity destination "${entity}" names an unknown entity`;
  }
}
