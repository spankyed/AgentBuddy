<template>
  <Teleport to="body">
    <div
      v-if="isPopupVisible"
      ref="popupEl"
      class="command-suggestion-popup"
      :style="popupStyle"
    >
      <div
        v-for="(cmd, index) in filteredCommands"
        :key="cmd.name"
        class="command-suggestion-item"
        :class="{ 'is-selected': index === selectedIndex }"
        @mousedown.prevent="selectCommand(cmd)"
        @mouseenter="selectedIndex = index"
      >
        <span class="command-suggestion-name">/{{ cmd.name }}</span>
      </div>
      <div v-if="filteredCommands.length === 0" class="command-suggestion-empty">
        No matching commands
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import type { Editor } from '@tiptap/core'
import { commandSuggestionPluginKey, COMMAND_TRIGGER_POS } from './command-suggestion-plugin'
import { useCommandItems } from './useCommandItems'
import type { CommandItem } from './command-config'

const props = defineProps<{
  editor: Editor
}>()

const selectedIndex = ref(0)
const popupEl = ref<HTMLElement | null>(null)
const popupStyle = ref<Record<string, string>>({ bottom: '0px', left: '0px' })

// Read plugin state reactively
const pluginState = computed(() => {
  return commandSuggestionPluginKey.getState(props.editor.state)
})

const isActive = computed(() => pluginState.value?.active ?? false)
const query = computed(() => pluginState.value?.query ?? '')
const selectedCommand = computed(() => pluginState.value?.selectedCommand ?? null)

// Show popup only during query phase (active but no command selected yet)
const isPopupVisible = computed(() => isActive.value && !selectedCommand.value)

const { commands: filteredCommands } = useCommandItems(query)

// Reset selected index when list changes
watch(filteredCommands, () => {
  selectedIndex.value = 0
})

// Position the popup near the cursor (always above for chat variant)
function updatePosition() {
  if (!isPopupVisible.value || !pluginState.value) return

  try {
    const coords = props.editor.view.coordsAtPos(COMMAND_TRIGGER_POS)
    popupStyle.value = {
      bottom: `${window.innerHeight - coords.top + 4}px`,
      left: `${coords.left}px`,
    }
  } catch {
    // Position might be invalid during transitions
  }
}

watch(isPopupVisible, (visible) => {
  if (visible) {
    nextTick(updatePosition)
  }
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
  if (!isPopupVisible.value) return
  const target = event.target as Node
  if (popupEl.value?.contains(target)) return
  deactivateAndClean()
}

watch(isPopupVisible, (visible) => {
  if (visible) {
    document.addEventListener('mousedown', handleClickOutside, true)
  } else {
    document.removeEventListener('mousedown', handleClickOutside, true)
  }
})

// Keyboard navigation
function handleKeyDown(event: KeyboardEvent) {
  if (!isPopupVisible.value) return

  const maxIndex = filteredCommands.value.length - 1

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
    case 'ArrowRight':
      event.preventDefault()
      {
        const cmd = filteredCommands.value[selectedIndex.value]
        if (cmd) selectCommand(cmd)
      }
      break

    case 'Escape':
      event.preventDefault()
      deactivateAndClean()
      break
  }
}

// Register key handler on the editor's DOM
watch(isPopupVisible, (visible) => {
  try {
    if (visible) {
      props.editor.view.dom.addEventListener('keydown', handleKeyDown, true)
    } else {
      props.editor.view.dom.removeEventListener('keydown', handleKeyDown, true)
    }
  } catch {
    // Editor view may already be destroyed
  }
}, { immediate: true })

onBeforeUnmount(() => {
  try {
    props.editor.view.dom.removeEventListener('keydown', handleKeyDown, true)
  } catch {
    // Editor view may already be destroyed
  }
  document.removeEventListener('mousedown', handleClickOutside, true)
})

function selectCommand(cmd: CommandItem) {
  const state = pluginState.value
  if (!state) return

  // Replace /query with /commandName + space
  const from = COMMAND_TRIGGER_POS
  const to = props.editor.state.selection.head
  const commandText = `/${cmd.name} `

  const { tr } = props.editor.state
  tr.replaceWith(from, to, props.editor.state.schema.text(commandText))
  tr.setMeta(commandSuggestionPluginKey, {
    active: true,
    query: '',
    selectedCommand: cmd,
  })

  props.editor.view.dispatch(tr)
  selectedIndex.value = 0
}

function deactivateAndClean() {
  const state = pluginState.value
  if (!state) return

  // Remove the / and any query text
  const from = COMMAND_TRIGGER_POS
  const to = props.editor.state.selection.head

  const { tr } = props.editor.state
  tr.delete(from, to)
  tr.setMeta(commandSuggestionPluginKey, { deactivate: true })
  props.editor.view.dispatch(tr)
}
</script>

<style scoped>
.command-suggestion-popup {
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

.command-suggestion-item {
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

.command-suggestion-item.is-selected {
  background: rgb(55 55 55);
  color: rgb(245 245 245);
}

.command-suggestion-name {
  font-weight: 500;
  flex-shrink: 0;
}

.command-suggestion-empty {
  padding: 8px 10px;
  font-size: 0.8rem;
  color: rgb(115 115 115);
  text-align: center;
}
</style>
