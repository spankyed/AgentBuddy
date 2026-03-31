<template>
  <Teleport to="body">
    <div
      v-if="isActive"
      ref="popupEl"
      class="reference-suggestion-popup"
      :style="popupStyle"
    >
      <!-- Category Level -->
      <template v-if="level === 'category'">
        <div
          v-for="(cat, index) in filteredCategories"
          :key="cat.id"
          class="reference-suggestion-item"
          :class="{ 'is-selected': index === selectedIndex }"
          @mousedown.prevent="selectCategory(cat.id)"
          @mouseenter="selectedIndex = index"
        >
          <component :is="getCategoryIcon(cat.id)" class="reference-suggestion-icon" :size="16" />
          <span>{{ cat.label }}</span>
        </div>
        <div v-if="filteredCategories.length === 0" class="reference-suggestion-empty">
          No matching categories
        </div>
      </template>

      <!-- Items Level -->
      <template v-else>
        <div
          class="reference-suggestion-header"
          @mousedown.prevent="goBackToCategories"
        >
          <span class="reference-suggestion-back">&larr;</span>
          <span>{{ activeCategoryLabel }}</span>
        </div>
        <div
          v-for="(item, index) in items"
          :key="item.id"
          class="reference-suggestion-item"
          :class="{ 'is-selected': index === selectedIndex }"
          @mousedown.prevent="insertReference(item)"
          @mouseenter="selectedIndex = index"
        >
          <component :is="REF_TYPES[item.type].icon" class="reference-suggestion-icon" :size="16" />
          <span class="reference-suggestion-label">{{ item.label }}</span>
          <span class="reference-suggestion-code" :title="item.shortCode">{{ item.shortCode.length > 12 ? item.shortCode.slice(0, 12) + '…' : item.shortCode }}</span>
        </div>
        <div v-if="items.length === 0" class="reference-suggestion-empty">
          No matching items
        </div>
      </template>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import type { Editor } from '@tiptap/core'
import { referenceSuggestionPluginKey } from './reference-suggestion-plugin'
import { useReferenceItems, CATEGORIES, type ReferenceCategory, type ReferenceItem } from './useReferenceItems'
import { REF_TYPES } from './reference-config'

const props = defineProps<{
  editor: Editor
}>()

const selectedIndex = ref(0)
const popupEl = ref<HTMLElement | null>(null)
const popupStyle = ref<{ bottom: string; left: string }>({ bottom: '0px', left: '0px' })

function getCategoryIcon(id: ReferenceCategory) {
  return CATEGORIES.find((c) => c.id === id)?.primaryIcon
}

// Read plugin state reactively
const pluginState = computed(() => {
  return referenceSuggestionPluginKey.getState(props.editor.state)
})

const isActive = computed(() => pluginState.value?.active ?? false)
const level = computed(() => pluginState.value?.level ?? 'category')
const query = computed(() => pluginState.value?.query ?? '')
const selectedCategory = computed(() => pluginState.value?.selectedCategory ?? null)

const activeCategoryLabel = computed(() => {
  const cat = CATEGORIES.find((c) => c.id === selectedCategory.value)
  return cat?.label ?? ''
})

// Filter categories by query
const filteredCategories = computed(() => {
  const q = query.value.toLowerCase()
  if (!q) return CATEGORIES
  return CATEGORIES.filter((c) => c.label.toLowerCase().includes(q))
})

// Auto-select category when user manually types colon (e.g. #notes:)
watch([query, level], ([q, lvl]) => {
  if (lvl !== 'category' || !q.endsWith(':')) return
  const typed = q.slice(0, -1)
  const match = CATEGORIES.find(
    (c) => c.label.toLowerCase().replace(/\s+/g, '') === typed
  )
  if (!match) return
  const state = pluginState.value
  if (!state) return
  const { tr } = props.editor.state
  tr.setMeta(referenceSuggestionPluginKey, {
    active: true,
    triggerPos: state.triggerPos,
    query: '',
    level: 'items',
    selectedCategory: match.id,
    categoryQuery: q,
  })
  props.editor.view.dispatch(tr)
  selectedIndex.value = 0
})

// Fetch items for selected category
const itemQuery = computed(() => (level.value === 'items' ? query.value : ''))
const { items } = useReferenceItems(selectedCategory, itemQuery)

// Reset selected index when list changes
watch([filteredCategories, items, level], () => {
  selectedIndex.value = 0
})

// Position the popup near the cursor
function updatePosition() {
  if (!isActive.value || !pluginState.value) return

  try {
    const coords = props.editor.view.coordsAtPos(pluginState.value.triggerPos)
    popupStyle.value = {
      bottom: `${window.innerHeight - coords.top + 4}px`,
      left: `${coords.left}px`,
    }
  } catch {
    // Position might be invalid during transitions
  }
}

watch(isActive, (active) => {
  if (active) {
    nextTick(updatePosition)
  }
})

watch(() => pluginState.value?.triggerPos, () => {
  if (isActive.value) nextTick(updatePosition)
})

// Reposition when content changes (e.g. switching from categories to items)
watch([level, items], () => {
  if (isActive.value) nextTick(updatePosition)
})

// Scroll/resize handlers
onMounted(() => {
  window.addEventListener('scroll', updatePosition, true)
  window.addEventListener('resize', updatePosition)
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', updatePosition, true)
  window.removeEventListener('resize', updatePosition)
})

// Close on outside click
function handleClickOutside(event: MouseEvent) {
  if (!isActive.value) return
  const target = event.target as Node
  if (popupEl.value?.contains(target)) return
  deactivateAndClean()
}

watch(isActive, (active) => {
  if (active) {
    document.addEventListener('mousedown', handleClickOutside, true)
  } else {
    document.removeEventListener('mousedown', handleClickOutside, true)
  }
})

// Keyboard navigation
function handleKeyDown(event: KeyboardEvent) {
  if (!isActive.value) return

  const currentList = level.value === 'category' ? filteredCategories.value : items.value
  const maxIndex = currentList.length - 1

  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      selectedIndex.value = Math.min(selectedIndex.value + 1, maxIndex)
      break

    case 'ArrowUp':
      event.preventDefault()
      selectedIndex.value = Math.max(selectedIndex.value - 1, 0)
      break

    case 'Enter':
    case 'Tab':
      event.preventDefault()
      if (level.value === 'category') {
        const cat = filteredCategories.value[selectedIndex.value]
        if (cat) selectCategory(cat.id)
      } else {
        const item = items.value[selectedIndex.value]
        if (item) insertReference(item)
      }
      break

    case 'Escape':
      event.preventDefault()
      deactivateAndClean()
      break

    case 'Backspace':
      if (level.value === 'items' && query.value === '') {
        event.preventDefault()
        goBackToCategories()
      }
      break
  }
}

// Register key handler on the editor's DOM
watch(isActive, (active) => {
  if (active) {
    props.editor.view.dom.addEventListener('keydown', handleKeyDown, true)
  } else {
    props.editor.view.dom.removeEventListener('keydown', handleKeyDown, true)
  }
}, { immediate: true })

onBeforeUnmount(() => {
  props.editor.view.dom.removeEventListener('keydown', handleKeyDown, true)
  document.removeEventListener('mousedown', handleClickOutside, true)
})

function selectCategory(id: ReferenceCategory) {
  const cat = CATEGORIES.find((c) => c.id === id)
  if (!cat) return

  const state = pluginState.value
  if (!state) return

  // Replace the typed query with the category name prefix
  const { tr } = props.editor.state
  // Current text from # to cursor: triggerPos+1 ... cursor
  const from = state.triggerPos + 1
  const to = props.editor.state.selection.head
  const categoryPrefix = cat.label.toLowerCase().replace(/\s+/g, '') + ':'

  tr.replaceWith(from, to, props.editor.state.schema.text(categoryPrefix))
  tr.setMeta(referenceSuggestionPluginKey, {
    active: true,
    triggerPos: state.triggerPos,
    query: '',
    level: 'items',
    selectedCategory: id,
    categoryQuery: categoryPrefix,
  })

  props.editor.view.dispatch(tr)
  selectedIndex.value = 0
}

function goBackToCategories() {
  const state = pluginState.value
  if (!state) return

  // Remove the category prefix text, just leave #
  const { tr } = props.editor.state
  const from = state.triggerPos + 1
  const to = props.editor.state.selection.head
  tr.delete(from, to)
  tr.setMeta(referenceSuggestionPluginKey, {
    active: true,
    triggerPos: state.triggerPos,
    query: '',
    level: 'category',
    selectedCategory: null,
    categoryQuery: '',
  })

  props.editor.view.dispatch(tr)
  selectedIndex.value = 0
}

function insertReference(item: ReferenceItem) {
  const state = pluginState.value
  if (!state) return

  // Replace from # to cursor with the reference node
  const from = state.triggerPos
  const to = props.editor.state.selection.head

  props.editor
    .chain()
    .focus()
    .deleteRange({ from, to })
    .insertContentAt(from, [
      {
        type: 'reference',
        attrs: {
          refType: item.type,
          refId: item.id,
          shortCode: item.shortCode,
          label: item.label,
        },
      },
      { type: 'text', text: ' ' },
    ])
    .run()

  // Deactivate suggestion
  const { tr } = props.editor.state
  tr.setMeta(referenceSuggestionPluginKey, { deactivate: true })
  props.editor.view.dispatch(tr)
}

function deactivateAndClean() {
  const state = pluginState.value
  if (!state) return

  // Remove the # and any query text
  const from = state.triggerPos
  const to = props.editor.state.selection.head

  const { tr } = props.editor.state
  tr.delete(from, to)
  tr.setMeta(referenceSuggestionPluginKey, { deactivate: true })
  props.editor.view.dispatch(tr)
}
</script>

<style scoped>
.reference-suggestion-popup {
  position: fixed;
  z-index: 9999;
  min-width: 220px;
  max-width: 320px;
  max-height: 280px;
  overflow-y: auto;
  background: rgb(30 30 30);
  border: 1px solid rgb(64 64 64);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  padding: 4px;
}

.reference-suggestion-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  font-size: 0.8rem;
  color: rgb(163 163 163);
  cursor: pointer;
  border-bottom: 1px solid rgb(50 50 50);
  margin-bottom: 2px;
}

.reference-suggestion-header:hover {
  color: rgb(212 212 212);
}

.reference-suggestion-back {
  font-size: 0.9rem;
}

.reference-suggestion-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  font-size: 0.85rem;
  color: rgb(212 212 212);
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.reference-suggestion-item.is-selected {
  background: rgb(55 55 55);
  color: rgb(245 245 245);
}

.reference-suggestion-icon {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  color: rgb(163 163 163);
}

.reference-suggestion-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
}

.reference-suggestion-code {
  flex-shrink: 0;
  font-size: 0.75rem;
  color: rgb(115 115 115);
  font-family: ui-monospace, SFMono-Regular, monospace;
}

.reference-suggestion-empty {
  padding: 8px 10px;
  font-size: 0.8rem;
  color: rgb(115 115 115);
  text-align: center;
}
</style>
