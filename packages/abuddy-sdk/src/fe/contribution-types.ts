import type { Component } from 'vue'
import type { PluginActorSystem } from './actor-system.ts'

type SvgElement = ['path', { d: string }] | ['rect', Record<string, string>] | ['circle', Record<string, string>]

/** Defines how an entity type appears and navigates when contributed to the UI. */
export interface ContributionTypeConfig {
  protocol: string
  category: string
  plugin: string
  icon: Component
  svgElements: SvgElement[]
  navigate: (system: PluginActorSystem, refId: string) => void
}

export interface CategoryConfig {
  id: string
  label: string
  primaryIcon: Component
}

export interface ContributionItem {
  id: string
  shortCode: string
  label: string
  type: string
}

/** Provides items for a contribution category by querying feature actor state. */
export interface CategoryItemsProvider<TSnapshot = unknown> {
  category: string
  pluginId: string
  /** Builds the items from the plugin actor's snapshot (undefined until the actor exists) */
  buildItems(snapshot: TSnapshot | undefined): ContributionItem[]
}
