<template>
  <div
    v-if="isOpen"
    class="absolute top-2 right-4 z-50 flex items-center gap-1.5 bg-neutral-800 border border-neutral-700 rounded-lg shadow-lg px-3 py-1.5"
  >
    <input
      ref="inputRef"
      v-model="query"
      placeholder="Find..."
      class="bg-transparent text-sm text-neutral-200 outline-none w-48 placeholder-neutral-500"
      @input="onQueryChange"
      @keydown="onKeydown"
    />
    <span v-if="query" class="text-xs text-neutral-400 whitespace-nowrap">
      {{ matchCount > 0 ? `${currentIndex + 1} of ${matchCount}` : 'No results' }}
    </span>
    <button
      class="p-1 rounded hover:bg-neutral-700 text-neutral-400 hover:text-neutral-200 transition-colors"
      title="Previous match (Shift+Enter)"
      @click="prevMatch"
    >
      <ChevronUp :size="14" />
    </button>
    <button
      class="p-1 rounded hover:bg-neutral-700 text-neutral-400 hover:text-neutral-200 transition-colors"
      title="Next match (Enter)"
      @click="nextMatch"
    >
      <ChevronDown :size="14" />
    </button>
    <button
      class="p-1 rounded hover:bg-neutral-700 text-neutral-400 hover:text-neutral-200 transition-colors"
      title="Close (Escape)"
      @click="close"
    >
      <X :size="14" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, onBeforeUnmount } from 'vue'
import { ChevronUp, ChevronDown, X } from 'lucide-vue-next'
import type { Editor } from '@tiptap/core'
import { searchPluginKey } from './extensions/search-plugin'

const props = defineProps<{
  editor: Editor
}>()

const isOpen = ref(false)
const query = ref('')
const matchCount = ref(0)
const currentIndex = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)

function readPluginState() {
  const state = searchPluginKey.getState(props.editor.state)
  if (state) {
    matchCount.value = state.matches.length
    currentIndex.value = state.currentIndex
  }
}

function dispatchMeta(meta: Record<string, unknown>) {
  const { view } = props.editor
  view.dispatch(view.state.tr.setMeta(searchPluginKey, meta))
  readPluginState()
}

function open() {
  isOpen.value = true
  // If there's a previous query, re-dispatch to restore highlights
  if (query.value) {
    dispatchMeta({ query: query.value })
  } else {
    dispatchMeta({ open: true })
  }
  nextTick(() => {
    inputRef.value?.focus()
    inputRef.value?.select()
  })
}

function close() {
  dispatchMeta({ close: true })
  isOpen.value = false
  query.value = ''
  matchCount.value = 0
  currentIndex.value = 0
  props.editor.commands.focus()
}

function onQueryChange() {
  dispatchMeta({ query: query.value })
  scrollToCurrentMatch()
}

function nextMatch() {
  if (matchCount.value === 0) return
  dispatchMeta({ nextMatch: true })
  scrollToCurrentMatch()
}

function prevMatch() {
  if (matchCount.value === 0) return
  dispatchMeta({ prevMatch: true })
  scrollToCurrentMatch()
}

function scrollToCurrentMatch() {
  const state = searchPluginKey.getState(props.editor.state)
  if (!state || state.matches.length === 0) return
  const match = state.matches[state.currentIndex]
  if (!match) return
  props.editor.chain().setTextSelection(match.from).scrollIntoView().run()
  // Return focus to the search input
  nextTick(() => inputRef.value?.focus())
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    close()
  } else if (e.key === 'Enter' && e.shiftKey) {
    e.preventDefault()
    prevMatch()
  } else if (e.key === 'Enter') {
    e.preventDefault()
    nextMatch()
  }
}

// Listen for the "open" meta dispatched by the ProseMirror plugin (Ctrl+F inside editor)
function onTransaction({ transaction }: { transaction: import('@tiptap/pm/state').Transaction }) {
  const meta = transaction.getMeta(searchPluginKey)
  if (meta?.open && !isOpen.value) {
    open()
  }
  // Keep match count in sync when document changes while search is open
  if (isOpen.value) {
    readPluginState()
  }
}

props.editor.on('transaction', onTransaction)
onBeforeUnmount(() => {
  props.editor.off('transaction', onTransaction)
})

defineExpose({ open })
</script>
