import { boundFeHost } from '../runtime/fe-host.ts'
import type { ReferenceCatalogEntry, PackCatalogView } from '../framework/catalog-view.ts'
import type { FeatureRef } from '../ids/refs.ts'
import type { Component, Ref } from 'vue'

import type { ReferenceSvgElement } from '../framework/reference-declaration.ts'

export { getReferenceTypeDeclaration, getReferenceCategoryDeclarations, getReferenceTypeBinding, getReferenceCategoryBinding, onReferenceBindingsChanged } from './reference-reader.ts'
export type { ReferenceCategoryMetadata } from './reference-reader.ts'

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

/** Metadata remains available without executing navigation, providers or components. */
export function getReferenceDeclarations(): readonly ReferenceCatalogEntry[] {
  return boundFeHost().catalog.references()
}

/** A retained snapshot may be unavailable after disconnect; execution must use current readiness. */
export function getReferenceCatalogStatus(): ReturnType<PackCatalogView['status']> {
  return boundFeHost().catalog.status()
}

/** Observe declaration updates independently of executable registration changes. */
export function onReferenceDeclarationsChanged(listener: () => void): () => void {
  return boundFeHost().catalog.subscribe(listener)
}
