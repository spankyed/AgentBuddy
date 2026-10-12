import type { Component, Ref } from 'vue'
import { boundFeHost } from '../runtime/fe-host.ts'

type SvgElement = ['path', { d: string }] | ['rect', Record<string, string>] | ['circle', Record<string, string>]

/** Defines how an entity type appears and navigates when contributed to the UI. */
export interface ReferenceTypeConfig {
  protocol: string
  category: string
  icon: Component
  svgElements: SvgElement[]
  /** Opens the entity a reference names */
  navigate: (refId: string) => void
}

export interface CategoryConfig {
  id: string
  label: string
  primaryIcon: Component
}

export interface ReferenceItem {
  id: string
  shortCode: string
  label: string
  type: string
}

/**
 * What a pack's frontend contributes about the things of its that an editor can link to: the types, the
 * categories they are grouped under, and where each category's items come from.
 *
 * One shape rather than three loose exports, and the providers are a **list** — a feature owning two
 * categories could not say so while this was a single `itemsProvider`.
 */
export interface PackReferences {
  types: Record<string, ReferenceTypeConfig>
  categories: CategoryConfig[]
  itemsProviders: CategoryItemsProvider[]
}

/** Provides the items in a reference category, from the frontend state of the feature that owns them. */
export interface CategoryItemsProvider {
  category: string
  /** The category's items as they change: a composable, called in the setup of the component that lists them */
  useItems(): Readonly<Ref<ReferenceItem[]>>
}

/**
 * The reference types, categories and item providers the registered pack frontends contribute — every
 * pack's, not the declaring pack's own. The editor that renders references reads this, so a pack
 * contributing a type gets it rendered, linked and listed by whichever pack provides the editor.
 */
export const referenceRegistry = {
  /** One type by name, or none: a name is a name and nothing about it says a pack declared it */
  type(name: string): ReferenceTypeConfig | undefined {
    return boundFeHost().packs.references().types[name];
  },
  types(): Record<string, ReferenceTypeConfig> {
    return boundFeHost().packs.references().types;
  },
  categories(): CategoryConfig[] {
    return boundFeHost().packs.references().categories;
  },
  itemsProviders(): CategoryItemsProvider[] {
    return boundFeHost().packs.references().itemsProviders;
  },
  /** Every URL scheme a reference may use, which the editor's autolinking has to recognise */
  protocols(): string[] {
    return Object.values(boundFeHost().packs.references().types).map((type) => type.protocol);
  },
};
