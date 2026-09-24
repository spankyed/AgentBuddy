import type { Component, Ref } from 'vue'

type SvgElement = ['path', { d: string }] | ['rect', Record<string, string>] | ['circle', Record<string, string>]

/** Defines how an entity type appears and navigates when contributed to the UI. */
export interface ReferenceTypeConfig {
  protocol: string
  category: string
  plugin: string
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

/** Provides the items in a reference category, from the frontend state of the feature that owns them. */
export interface CategoryItemsProvider {
  category: string
  /** The category's items as they change: a composable, called in the setup of the component that lists them */
  useItems(): Readonly<Ref<ReferenceItem[]>>
}
