import { PluginKey } from '@tiptap/pm/state'

export interface ReferenceSuggestionState {
  active: boolean
  triggerPos: number
  query: string
  level: 'category' | 'items'
  selectedCategory: string | null
  categoryQuery: string
}

export const referenceSuggestionPluginKey = new PluginKey<ReferenceSuggestionState>('referenceSuggestion')
