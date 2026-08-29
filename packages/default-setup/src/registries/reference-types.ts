import type { Component } from 'vue'

type SvgElement = ['path', { d: string }] | ['rect', Record<string, string>] | ['circle', Record<string, string>]

export interface RefTypeConfig {
  protocol: string
  category: string
  plugin: string
  icon: Component
  svgElements: SvgElement[]
  navigate: (system: any, refId: string) => void
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

export interface CategoryItemsProvider {
  category: string
  pluginId: string
  buildItems: (actorState: any) => ReferenceItem[]
}
