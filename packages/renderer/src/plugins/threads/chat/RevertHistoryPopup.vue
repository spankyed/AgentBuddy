<template>
  <Teleport to="body">
    <div
      v-if="open && visibleMessages.length > 0"
      ref="popupEl"
      class="revert-history-popup"
      :style="popupStyle"
    >
      <!-- Level 1: messages -->
      <template v-if="level === 'messages'">
        <div
          v-for="(msg, index) in visibleMessages"
          :key="msg.id"
          class="revert-history-item"
          :class="{ 'is-selected': index === selectedIndex }"
          @mousedown.prevent="onMessageActivate(index)"
          @mouseenter="selectedIndex = index"
          :title="msg.text"
        >
          <span class="revert-history-time">{{ formatTime(msg.createdAt) }}</span>
          <span class="revert-history-snippet">{{ snippet(msg.text) }}</span>
          <ChevronRight :size="14" class="revert-history-caret" />
        </div>
      </template>

      <!-- Level 2: actions for the selected message -->
      <template v-else>
        <div
          v-for="(action, index) in actions"
          :key="action.id"
          class="revert-history-item"
          :class="{ 'is-selected': index === selectedIndex }"
          @mousedown.prevent="runAction(action.id)"
          @mouseenter="selectedIndex = index"
        >
          <component :is="action.icon" :size="14" class="revert-history-icon" />
          <span class="revert-history-snippet">{{ action.label }}</span>
        </div>
        <div class="revert-history-hint">
          <span class="revert-history-hint-key">Enter</span>
          <span>confirm</span>
          <span class="revert-history-hint-sep">·</span>
          <span class="revert-history-hint-key">&larr;</span>
          <span>back</span>
        </div>
      </template>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount, nextTick } from 'vue'
import { Undo2, FileCode2, ChevronRight } from 'lucide-vue-next'
import type { MessageEntity } from '@app/api'

// The threads state machine types `currentThread.messages` as
// `Partial<MessageEntity>[]` — mirror that here so we don't force callers
// to cast. We only read a handful of fields and null-check them.
type PartialMessage = Partial<MessageEntity>

const props = defineProps<{
  open: boolean
  anchorEl: HTMLElement | null
  messages: PartialMessage[]
}>()

const emit = defineEmits<{
  (e: 'revert', messageId: string): void
  (e: 'revert-with-files', messageId: string): void
  (e: 'close'): void
}>()

const MAX_MESSAGES = 25
const SNIPPET_LEN = 72

type MessageRow = {
  id: string
  text: string
  createdAt?: number | string
}

// User-visible messages: user-sent, not cancelled, capped to the most
// recent MAX_MESSAGES. Chronological order — oldest at top, most recent
// at the bottom — so the list reads like the thread itself and the
// initial selection (most recent) sits nearest the chat input.
// Drop anything missing an id (shouldn't happen in practice, but the
// state-machine type models `messages` as `Partial<MessageEntity>[]`).
const visibleMessages = computed<MessageRow[]>(() => {
  return props.messages
    .filter(
      (m): m is PartialMessage & { id: string } =>
        !!m.id && m.sender === 'user' && (m as any).status !== 'cancelled',
    )
    .slice(-MAX_MESSAGES)
    .map((m) => ({
      id: m.id,
      text: m.text ?? '',
      // Fall back to `timestamp`: the batch picker that loads historic
      // messages into currentThread.messages doesn't include `createdAt`,
      // so the very first row of a thread only has `timestamp`. Both
      // fields hold the message's creation epoch ms, so either renders.
      createdAt: (m as any).createdAt ?? (m as any).timestamp,
    }))
})

type ActionId = 'revert' | 'revert-with-files'
const actions: { id: ActionId; label: string; icon: typeof Undo2 }[] = [
  { id: 'revert', label: 'Revert', icon: Undo2 },
  { id: 'revert-with-files', label: 'Revert and rewind code', icon: FileCode2 },
]

const level = ref<'messages' | 'actions'>('messages')
const selectedIndex = ref(0)
const selectedMessageId = ref<string | null>(null)
const popupEl = ref<HTMLElement | null>(null)
const popupStyle = ref<Record<string, string>>({ bottom: '0px', left: '0px' })

const selectedMessage = computed(() =>
  visibleMessages.value.find((m) => m.id === selectedMessageId.value) ?? null,
)

// Reset level and selection whenever the popup (re)opens. Start the
// highlight on the most recent message (bottom row) so arrow-up walks
// backwards in time — the natural "I want to go back N turns" motion.
watch(() => props.open, (isOpen) => {
  if (isOpen) {
    level.value = 'messages'
    selectedIndex.value = Math.max(0, visibleMessages.value.length - 1)
    selectedMessageId.value = null
    nextTick(() => { updatePosition(); scrollSelectedIntoView() })
  }
})

// Keep the selected row visible when navigating a scrolled list.
function scrollSelectedIntoView() {
  const el = popupEl.value?.querySelector<HTMLElement>('.revert-history-item.is-selected')
  el?.scrollIntoView({ block: 'nearest' })
}

watch(selectedIndex, () => nextTick(scrollSelectedIntoView))

// When drilling into actions, start on the first action. When popping
// back to messages, `goBackToMessages` chooses the right index itself
// (and popup-open picks the most-recent row) — don't clobber either.
watch(level, (newLevel) => {
  if (newLevel === 'actions') selectedIndex.value = 0
})

// Clamp index if the message list shrinks while open.
watch(visibleMessages, (list) => {
  if (level.value !== 'messages') return
  if (selectedIndex.value > list.length - 1) {
    selectedIndex.value = Math.max(0, list.length - 1)
  }
})

function snippet(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim()
  return oneLine.length > SNIPPET_LEN ? oneLine.slice(0, SNIPPET_LEN) + '…' : oneLine || '(empty)'
}

function formatTime(createdAt?: number | string): string {
  if (!createdAt) return ''
  const d = new Date(createdAt)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// Position: anchored above the provided element, flush with its left edge.
function updatePosition() {
  if (!props.open || !props.anchorEl) return
  const rect = props.anchorEl.getBoundingClientRect()
  popupStyle.value = {
    bottom: `${window.innerHeight - rect.top + 6}px`,
    left: `${rect.left}px`,
    // Don't let the popup exceed the anchor's width — the anchor is the
    // card that visually "owns" this menu.
    maxWidth: `${Math.max(260, Math.min(rect.width, 520))}px`,
  }
}

function onMessageActivate(index: number) {
  selectedIndex.value = index
  // Any interaction on a message row — click, Enter, Tab, → — drills
  // into the action sub-menu. Reverting requires an explicit choice
  // at level 2 so users can't destructively revert with a single stray
  // click or Enter.
  drillIntoActions()
}

function drillIntoActions() {
  const msg = visibleMessages.value[selectedIndex.value]
  if (!msg) return
  selectedMessageId.value = msg.id
  level.value = 'actions'
}

function goBackToMessages() {
  level.value = 'messages'
  // Re-highlight the message we just drilled into, if still present;
  // otherwise fall back to the most recent row (matches initial open).
  const prevId = selectedMessageId.value
  const idx = visibleMessages.value.findIndex((m) => m.id === prevId)
  selectedIndex.value = idx >= 0 ? idx : Math.max(0, visibleMessages.value.length - 1)
  selectedMessageId.value = null
}

function runAction(id: ActionId) {
  const msg = selectedMessage.value
  if (!msg) return
  if (id === 'revert') emit('revert', msg.id)
  else emit('revert-with-files', msg.id)
  emit('close')
}

// Keyboard navigation. Document-level so it works regardless of whether
// the editor still owns focus. Only active while the popup is open.
function handleKeyDown(event: KeyboardEvent) {
  if (!props.open) return

  if (level.value === 'messages') {
    const max = visibleMessages.value.length - 1
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault(); event.stopPropagation()
        selectedIndex.value = Math.min(selectedIndex.value + 1, max)
        return
      case 'ArrowUp':
        event.preventDefault(); event.stopPropagation()
        selectedIndex.value = Math.max(selectedIndex.value - 1, 0)
        return
      case 'Enter':
      case 'ArrowRight':
      case 'Tab':
        event.preventDefault(); event.stopPropagation()
        drillIntoActions()
        return
      case 'Escape':
        event.preventDefault(); event.stopPropagation()
        emit('close')
        return
    }
    return
  }

  // Level 2 — actions
  const max = actions.length - 1
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault(); event.stopPropagation()
      selectedIndex.value = Math.min(selectedIndex.value + 1, max)
      return
    case 'ArrowUp':
      event.preventDefault(); event.stopPropagation()
      selectedIndex.value = Math.max(selectedIndex.value - 1, 0)
      return
    case 'Enter':
      event.preventDefault(); event.stopPropagation()
      runAction(actions[selectedIndex.value].id)
      return
    case 'ArrowLeft':
    case 'Backspace':
      event.preventDefault(); event.stopPropagation()
      goBackToMessages()
      return
    case 'Tab':
      event.preventDefault(); event.stopPropagation()
      if (event.shiftKey) goBackToMessages()
      return
    case 'Escape':
      event.preventDefault(); event.stopPropagation()
      emit('close')
      return
  }
}

function handleClickOutside(event: MouseEvent) {
  if (!props.open) return
  const target = event.target as Node
  if (popupEl.value?.contains(target)) return
  emit('close')
}

watch(() => props.open, (isOpen) => {
  if (isOpen) {
    document.addEventListener('keydown', handleKeyDown, true)
    document.addEventListener('mousedown', handleClickOutside, true)
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
  } else {
    document.removeEventListener('keydown', handleKeyDown, true)
    document.removeEventListener('mousedown', handleClickOutside, true)
    window.removeEventListener('scroll', updatePosition, true)
    window.removeEventListener('resize', updatePosition)
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeyDown, true)
  document.removeEventListener('mousedown', handleClickOutside, true)
  window.removeEventListener('scroll', updatePosition, true)
  window.removeEventListener('resize', updatePosition)
})
</script>

<style scoped>
.revert-history-popup {
  position: fixed;
  z-index: 9999;
  min-width: 300px;
  max-height: 320px;
  overflow-y: auto;
  background: rgb(30 30 30);
  border: 1px solid rgb(55 55 60);
  border-radius: 8px;
  box-shadow:
    0 12px 32px rgba(0, 0, 0, 0.45),
    0 2px 6px rgba(0, 0, 0, 0.3);
  padding: 6px;
}

.revert-history-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 12px;
  font-size: 0.85rem;
  line-height: 1.3;
  color: rgb(212 212 212);
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
}

.revert-history-item:hover {
  background: rgb(40 40 40);
}

.revert-history-item.is-selected {
  background: rgb(45 45 50);
  color: rgb(245 245 245);
  /* Subtle flush-left accent — a monochrome focus indicator. */
  box-shadow: inset 2px 0 0 rgb(120 120 140);
}

.revert-history-time {
  flex-shrink: 0;
  font-size: 0.7rem;
  color: rgb(130 130 135);
  font-variant-numeric: tabular-nums;
  min-width: 3.2em;
}

.revert-history-snippet {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
}

.revert-history-caret {
  flex-shrink: 0;
  color: rgb(150 150 150);
  /* Only reveal the caret on the focused row — teaches "press → here"
   * without peppering every row with chevrons. */
  opacity: 0;
  transition: opacity 120ms ease;
}

.revert-history-item:hover .revert-history-caret,
.revert-history-item.is-selected .revert-history-caret {
  opacity: 1;
}

.revert-history-icon {
  flex-shrink: 0;
  color: rgb(163 163 163);
}

.revert-history-hint {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px 2px;
  margin-top: 4px;
  font-size: 0.7rem;
  line-height: 1.2;
  color: rgb(125 125 125);
}

.revert-history-hint-key {
  font-family: ui-monospace, SFMono-Regular, monospace;
  color: rgb(180 180 180);
  margin-right: 2px;
}

.revert-history-hint-sep {
  margin: 0 6px;
  color: rgb(85 85 85);
}
</style>
