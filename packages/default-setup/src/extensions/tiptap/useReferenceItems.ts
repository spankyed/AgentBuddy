import { computed, type Ref } from 'vue'
import { CATEGORIES, ITEMS_PROVIDERS } from '@/__generated__/references'
import type { ReferenceItem } from '@abuddy/sdk/fe/references'

export type ReferenceCategory = string
export type { ReferenceItem }
export { CATEGORIES }

export function useReferenceItems(category: Ref<string | null>, query: Ref<string>) {
  // Each category's items, from the feature that owns them
  const categoryItems = new Map(ITEMS_PROVIDERS.map((provider) => [provider.category, provider.useItems()] as const))

  const items = computed<ReferenceItem[]>(() => {
    if (!category.value) return []
    const raw = categoryItems.get(category.value)?.value ?? []

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
