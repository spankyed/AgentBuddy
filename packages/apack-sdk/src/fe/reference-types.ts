import type { FeatureRef } from '../ids/refs.ts'
import type { Component, Ref } from 'vue'

import type { ReferenceSvgElement } from '../framework/reference-declaration.ts'

/** Defines how an entity type appears and navigates when contributed to the UI. */
export interface ReferenceTypeConfig {
  protocol: string
  category: string
  icon: Component
  svgElements: readonly ReferenceSvgElement[]
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

/** Executable bindings for one feature's declared reference contributions. */
export interface ReferenceBindings {
  types: Record<string, ReferenceTypeConfig>
  categories: Record<string, {
    label: string
    icon: Component
    useItems(): Readonly<Ref<ReferenceItem[]>>
  }>
}

/** An accepted reference contribution and the identity the host admitted it under. */
export interface ReferenceBinding<T> {
  readonly featureRef: FeatureRef
  readonly declarationRevision?: string
  readonly runtimeRevision?: string
  readonly artifactRevision?: string
  readonly binding: Readonly<T>
}
