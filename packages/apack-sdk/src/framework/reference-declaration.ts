import type { PluginDeclaration } from './plugin-declaration.ts';

/** SVG geometry available before a reference provider executes. */
export type ReferenceSvgElement = readonly ['path', { readonly d: string }] | readonly ['rect', Readonly<Record<string, string>>] | readonly ['circle', Readonly<Record<string, string>>];

export interface ReferenceTypeDeclaration {
  protocol: string;
  category: string;
  icon: NonNullable<PluginDeclaration['icon']>;
  svgElements: readonly ReferenceSvgElement[];
  navigate: string;
}

export interface ReferenceCategoryDeclaration {
  label: string;
  icon: NonNullable<PluginDeclaration['icon']>;
  useItems: string;
}

/** Static identities and presentation, with explicit executable bindings. */
export interface ReferenceDeclarations {
  types: Record<string, ReferenceTypeDeclaration>;
  categories: Record<string, ReferenceCategoryDeclaration>;
}

/** @internal Module targets used by validation and source freshness. */
export function _referenceTargets(references: ReferenceDeclarations): [string, string][] {
  return [
    ...Object.entries(references.types).flatMap(([id, type]): [string, string][] => [
      [`types.${id}.navigate`, type.navigate],
      ...(typeof type.icon === 'object' ? [[`types.${id}.icon`, type.icon.entry] as [string, string]] : []),
    ]),
    ...Object.entries(references.categories).flatMap(([id, category]): [string, string][] => [
      [`categories.${id}.useItems`, category.useItems],
      ...(typeof category.icon === 'object' ? [[`categories.${id}.icon`, category.icon.entry] as [string, string]] : []),
    ]),
  ];
}
