import type { ComponentTarget, PluginDeclaration } from './plugin-declaration.ts';
import type { StepNodeConfig } from '../steps/types.ts';

/** Static layout flags and the callable slots evaluated by the active flow editor. */
export interface StepLayoutDeclaration {
  getHeight?: string;
  getPorts?: string;
  hasInput?: boolean;
  usesExitCount?: boolean;
}

/** Presentation data and named bindings, readable before any step code executes. */
export interface StepFrontendDeclaration {
  nodeConfig: Omit<StepNodeConfig, 'icon'> & { icon: NonNullable<PluginDeclaration['icon']> };
  colorKey?: string;
  components?: { node?: ComponentTarget; form?: ComponentTarget };
  layout?: StepLayoutDeclaration;
  handlePrefix?: string;
}

/** @internal Named frontend targets, shared by file validation and binding generation. */
export function _stepFrontendTargets(frontend: StepFrontendDeclaration): [string, string, 'component' | 'script'][] {
  const component = (field: string, target: ComponentTarget): [string, string, 'component'] =>
    [field, typeof target === 'string' ? target : target.entry, 'component'];
  return [
    ...(typeof frontend.nodeConfig.icon === 'object' ? [component('nodeConfig.icon', frontend.nodeConfig.icon)] : []),
    ...Object.entries(frontend.components ?? {}).flatMap(([name, target]) => target === undefined ? [] : [component(`components.${name}`, target)]),
    ...(['getHeight', 'getPorts'] as const).flatMap(name => frontend.layout?.[name]
      ? [[`layout.${name}`, frontend.layout[name], 'script'] as [string, string, 'script']] : []),
  ];
}
