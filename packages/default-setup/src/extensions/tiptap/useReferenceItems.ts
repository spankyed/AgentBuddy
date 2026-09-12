import { computed, type Ref } from 'vue'
import { useSelector } from '@xstate/vue'
import { getEditorSystem } from '@abuddy/sdk/fe/components/tiptap/editor-system'
import { CATEGORIES, ITEMS_PROVIDERS } from '@/__generated__/contributions'
import type { ContributionItem, CategoryItemsProvider } from '@abuddy/sdk/fe/contributions'

export type ReferenceCategory = string
export type { ContributionItem }
export { CATEGORIES }

const providerMap = new Map<string, CategoryItemsProvider>(
  ITEMS_PROVIDERS.map(p => [p.category, p])
)

export function useReferenceItems(category: Ref<string | null>, query: Ref<string>) {
  const actorStates = new Map<string, any>()
  for (const provider of ITEMS_PROVIDERS) {
    const actor = getEditorSystem().get(provider.pluginId)
    const state = useSelector(actor, (s: any) => s)
    actorStates.set(provider.category, state)
  }

  const items = computed<ContributionItem[]>(() => {
    if (!category.value) return []
    const provider = providerMap.get(category.value)
    if (!provider) return []
    const state = actorStates.get(category.value)
    const raw = provider.buildItems(state?.value)

    const q = query.value.toLowerCase()
    if (q) {
      return raw
        .filter(item => item.label.toLowerCase().includes(q) || item.shortCode.toLowerCase().includes(q))
        .slice(0, 25)
    }
    return raw.slice(0, 25)
  })

  return { items }
}
