<template>
  <div class="flex flex-col h-full min-w-0 overflow-hidden shrink-0 border-r border-neutral-800 bg-neutral-900">
    <!-- Header -->
    <div class="flex items-center justify-between px-3 py-2.5 border-b border-neutral-800">
      <span class="text-xs font-medium text-neutral-400 uppercase tracking-wider">{{ showArchive ? 'Archived' : 'Threads' }}</span>
      <button @click="emit('close')" class="text-neutral-500 hover:text-neutral-300 transition-colors">
        <X :size="14" />
      </button>
    </div>

    <!-- Scrollable list -->
    <div class="flex-1 overflow-y-auto py-1" @scroll="onSidebarScroll">
      <!-- Archive view -->
      <template v-if="showArchive">
        <div v-if="archivedThreads.length === 0" class="py-8 text-center">
          <p class="text-sm text-neutral-500">No archived threads</p>
        </div>
        <ContextMenuRoot v-for="thread in archivedThreads.slice(0, archiveDisplayCount)" :key="thread.id">
          <ContextMenuTrigger as-child>
            <div
              class="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer transition-colors group hover:bg-neutral-800 text-neutral-300 hover:text-white"
              @click="emit('select-thread', thread.id!)"
            >
              <span class="shrink-0 w-1.5 h-1.5 rounded-full bg-neutral-600" />
              <span class="flex-1 min-w-0 truncate text-sm">{{ thread.topic || 'Untitled' }}</span>
            </div>
          </ContextMenuTrigger>
          <ThreadContextMenu
            :is-pinned="false" :is-archived="true" :copy-text="thread.shortCode || thread.id"
            @unarchive="handleUnarchive(thread.id!)" @delete="handleDelete(thread)"
          />
        </ContextMenuRoot>
      </template>

      <!-- Normal thread list -->
      <template v-else>
        <!-- Empty state -->
        <div v-if="allThreads.length === 0" class="py-8 text-center">
          <p class="text-sm text-neutral-500">No threads yet</p>
        </div>

        <template v-else>
          <!-- Pinned section -->
          <template v-if="pinnedThreads.length > 0">
            <div class="px-3 pt-3 pb-1">
              <span class="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Pinned</span>
            </div>

            <!-- Pinned groups -->
            <template v-for="pg in pinnedGroups" :key="pg.group.id">
              <div
                class="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-neutral-800/50 transition-colors"
                @click="toggleGroup(pg.group.id)"
              >
                <ChevronRight v-if="collapsedGroups.has(pg.group.id)" :size="12" class="text-neutral-500" />
                <ChevronDown v-else :size="12" class="text-neutral-500" />
                <span class="w-2 h-2 rounded-full shrink-0" :style="{ backgroundColor: groupColor(pg.group.color) }" />
                <span class="text-xs font-medium text-neutral-400 truncate">{{ pg.group.name }}</span>
              </div>
              <template v-if="!collapsedGroups.has(pg.group.id)">
                <ContextMenuRoot v-for="thread in pg.threads" :key="thread.id">
                  <ContextMenuTrigger as-child>
                    <div
                      class="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer transition-colors group"
                      :class="thread.id === currentThread?.id ? 'bg-blue-500/15 text-white' : 'hover:bg-neutral-800 text-neutral-300 hover:text-white'"
                      @click="emit('select-thread', thread.id!)"
                    >
                      <span class="shrink-0 relative inline-block w-1.5 h-1.5">
                        <span class="block w-full h-full rounded-full transition-colors" :class="getBusy(thread.id) ? 'mosaic-dot' : ''" :style="!getBusy(thread.id) ? { backgroundColor: getDotColor(thread.id) || '#525252' } : undefined" />
                        <span v-if="getBusy(thread.id)" class="absolute inset-0 rounded-full scale-[2] mosaic-glow" />
                      </span>
                      <span class="flex-1 min-w-0 truncate text-sm">{{ thread.topic || 'Untitled' }}</span>
                      <Pin v-if="thread.pinned" :size="10" class="shrink-0 text-blue-400/60" />
                    </div>
                  </ContextMenuTrigger>
                  <ThreadContextMenu
                    :is-pinned="!!thread.pinned" :is-archived="false" :copy-text="thread.shortCode || thread.id"
                    @rename="handleRename(thread.id!, thread.topic)" @pin="handlePin(thread.id!)" @unpin="handleUnpin(thread.id!)"
                    @archive="handleArchive(thread.id!)" @delete="handleDelete(thread)"
                  />
                </ContextMenuRoot>
              </template>
            </template>

            <!-- Ungrouped pinned threads -->
            <ContextMenuRoot v-for="thread in ungroupedPinnedThreads" :key="thread.id">
              <ContextMenuTrigger as-child>
                <div
                  class="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer transition-colors group"
                  :class="thread.id === currentThread?.id ? 'bg-blue-500/15 text-white' : 'hover:bg-neutral-800 text-neutral-300 hover:text-white'"
                  @click="emit('select-thread', thread.id!)"
                >
                  <span class="shrink-0 relative inline-block w-1.5 h-1.5">
                    <span class="block w-full h-full rounded-full transition-colors" :class="getBusy(thread.id) ? 'mosaic-dot' : ''" :style="!getBusy(thread.id) ? { backgroundColor: getDotColor(thread.id) || '#525252' } : undefined" />
                    <span v-if="getBusy(thread.id)" class="absolute inset-0 rounded-full scale-[2] mosaic-glow" />
                  </span>
                  <span class="flex-1 min-w-0 truncate text-sm">{{ thread.topic || 'Untitled' }}</span>
                  <Pin v-if="thread.pinned" :size="10" class="shrink-0 text-blue-400/60" />
                </div>
              </ContextMenuTrigger>
              <ThreadContextMenu
                :is-pinned="!!thread.pinned" :is-archived="false" :copy-text="thread.shortCode || thread.id"
                @rename="handleRename(thread.id!, thread.topic)" @pin="handlePin(thread.id!)" @unpin="handleUnpin(thread.id!)"
                @archive="handleArchive(thread.id!)" @delete="handleDelete(thread)"
              />
            </ContextMenuRoot>
          </template>

          <!-- Unpinned groups -->
          <template v-for="ug in unpinnedGroups" :key="ug.group.id">
            <div
              class="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-neutral-800/50 transition-colors"
              @click="toggleGroup(ug.group.id)"
            >
              <ChevronRight v-if="collapsedGroups.has(ug.group.id)" :size="12" class="text-neutral-500" />
              <ChevronDown v-else :size="12" class="text-neutral-500" />
              <span class="w-2 h-2 rounded-full shrink-0" :style="{ backgroundColor: groupColor(ug.group.color) }" />
              <span class="text-xs font-medium text-neutral-400 truncate">{{ ug.group.name }}</span>
            </div>
            <template v-if="!collapsedGroups.has(ug.group.id)">
              <ContextMenuRoot v-for="thread in ug.threads" :key="thread.id">
                <ContextMenuTrigger as-child>
                  <div
                    class="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer transition-colors group"
                    :class="thread.id === currentThread?.id ? 'bg-blue-500/15 text-white' : 'hover:bg-neutral-800 text-neutral-300 hover:text-white'"
                    @click="emit('select-thread', thread.id!)"
                  >
                    <span class="shrink-0 relative inline-block w-1.5 h-1.5">
                      <span class="block w-full h-full rounded-full transition-colors" :class="getBusy(thread.id) ? 'mosaic-dot' : ''" :style="!getBusy(thread.id) ? { backgroundColor: getDotColor(thread.id) || '#525252' } : undefined" />
                      <span v-if="getBusy(thread.id)" class="absolute inset-0 rounded-full scale-[2] mosaic-glow" />
                    </span>
                    <span class="flex-1 min-w-0 truncate text-sm">{{ thread.topic || 'Untitled' }}</span>
                    <Pin v-if="thread.pinned" :size="10" class="shrink-0 text-blue-400/60" />
                  </div>
                </ContextMenuTrigger>
                <ThreadContextMenu
                  :is-pinned="!!thread.pinned" :is-archived="false" :copy-text="thread.shortCode || thread.id"
                  @rename="handleRename(thread.id!, thread.topic)" @pin="handlePin(thread.id!)" @unpin="handleUnpin(thread.id!)"
                  @archive="handleArchive(thread.id!)" @delete="handleDelete(thread)"
                />
              </ContextMenuRoot>
            </template>
          </template>

          <!-- Time-based sections -->
          <template v-for="tg in timeGroups" :key="tg.label">
            <div class="px-3 pt-3 pb-1">
              <span class="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">{{ tg.label }}</span>
            </div>
            <ContextMenuRoot v-for="thread in tg.threads" :key="thread.id">
              <ContextMenuTrigger as-child>
                <div
                  class="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer transition-colors group"
                  :class="thread.id === currentThread?.id ? 'bg-blue-500/15 text-white' : 'hover:bg-neutral-800 text-neutral-300 hover:text-white'"
                  @click="emit('select-thread', thread.id!)"
                >
                  <span class="shrink-0 relative inline-block w-1.5 h-1.5">
                    <span class="block w-full h-full rounded-full transition-colors" :class="getBusy(thread.id) ? 'mosaic-dot' : ''" :style="!getBusy(thread.id) ? { backgroundColor: getDotColor(thread.id) || '#525252' } : undefined" />
                    <span v-if="getBusy(thread.id)" class="absolute inset-0 rounded-full scale-[2] mosaic-glow" />
                  </span>
                  <span class="flex-1 min-w-0 truncate text-sm">{{ thread.topic || 'Untitled' }}</span>
                  <Pin v-if="thread.pinned" :size="10" class="shrink-0 text-blue-400/60" />
                </div>
              </ContextMenuTrigger>
              <ThreadContextMenu
                :is-pinned="!!thread.pinned" :is-archived="false" :copy-text="thread.shortCode || thread.id"
                @rename="handleRename(thread.id!, thread.topic)" @pin="handlePin(thread.id!)" @unpin="handleUnpin(thread.id!)"
                @archive="handleArchive(thread.id!)" @delete="handleDelete(thread)"
              />
            </ContextMenuRoot>
          </template>
        </template>
      </template>
    </div>

    <!-- Fixed footer -->
    <div class="flex-shrink-0 border-t border-neutral-800 px-3 py-2">
      <button
        class="flex items-center gap-1.5 w-full text-sm text-neutral-500 hover:text-neutral-300 transition-colors"
        @click="toggleArchive"
      >
        <ChevronLeft v-if="showArchive" :size="14" />
        <span class="flex-1 text-left">{{ showArchive ? 'Back to Threads' : 'View Archive' }}</span>
        <Archive v-if="!showArchive" :size="14" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { X, ChevronDown, ChevronRight, ChevronLeft, Pin, Archive } from 'lucide-vue-next'
import { applicationState } from '@/main'
import { useSelector } from '@xstate/vue'
import { id, type ThreadsState, type ThreadListItem } from '@/plugins/threads/state'
import { getThreadDotColor, isThreadBusy } from './thread-status'
import { ContextMenuRoot, ContextMenuTrigger } from 'reka-ui'
import ThreadContextMenu from '@/plugins/threads/canvas/components/thread-context-menu.vue'
import { trpc } from '@/core/trpc'

const emit = defineEmits<{
  'select-thread': [threadId: string]
  'close': []
}>()

// State from threads actor
const actor: ThreadsState = applicationState.system.get(id)
const threadMap = useSelector(actor, (state) => state.context.threadMap)
const tabs = useSelector(actor, (state) => state.context.tabs)
const tabGroups = useSelector(actor, (state) => state.context.tabGroups)
const currentThread = useSelector(actor, (state) => state.context.currentThread)
const chatStates = useSelector(actor, (state) => state.context.chatStates)
const chatStateOverrides = useSelector(actor, (state) => state.context.chatStateOverrides)
const settings = useSelector(actor, (state) => state.context.settings)

// Collapsible groups (local UI state)
const collapsedGroups = reactive(new Set<string>())

function toggleGroup(groupId: string) {
  if (collapsedGroups.has(groupId)) collapsedGroups.delete(groupId)
  else collapsedGroups.add(groupId)
}

// Thread status helpers
function getDotColor(threadId: string | undefined): string | undefined {
  if (!threadId) return undefined
  return getThreadDotColor(threadId, chatStates.value, chatStateOverrides.value, settings.value)
}

function getBusy(threadId: string | undefined): boolean {
  if (!threadId) return false
  return isThreadBusy(threadId, chatStates.value, chatStateOverrides.value, settings.value)
}

// Render limiting
const BATCH_SIZE = 30
const displayCount = ref(BATCH_SIZE)
const archiveDisplayCount = ref(BATCH_SIZE)

function onSidebarScroll(e: Event) {
  const el = e.target as HTMLElement
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 100) {
    if (showArchive.value) {
      archiveDisplayCount.value = Math.min(archiveDisplayCount.value + BATCH_SIZE, archivedThreads.value.length)
    } else {
      displayCount.value += BATCH_SIZE
    }
  }
}

// Group color mapping
const groupColorMap: Record<string, string> = {
  blue: '#3B82F6', purple: '#8B5CF6', pink: '#EC4899', red: '#EF4444',
  orange: '#F97316', yellow: '#EAB308', green: '#22C55E', teal: '#14B8A6', gray: '#6B7280',
}
function groupColor(c: string) { return groupColorMap[c] || '#6B7280' }

// Sort timestamp for a thread
function sortTs(t: ThreadListItem): number {
  return t.lastVisitedTimestamp || t.lastMessageTimestamp || t.timestamp || 0
}

// All threads sorted by recency
const allThreads = computed(() =>
  Object.values(threadMap.value)
    .filter(t => !t.archived)
    .sort((a, b) => sortTs(b) - sortTs(a))
)

const pinnedThreads = computed(() => allThreads.value.filter(t => t.pinned))
const unpinnedThreads = computed(() => allThreads.value.filter(t => !t.pinned))

// Map threadId -> groupId from open tabs
const tabGroupMap = computed(() => {
  const map = new Map<string, string>()
  for (const tab of tabs.value) {
    if (tab.groupId) map.set(tab.id, tab.groupId)
  }
  return map
})

// Pinned groups
const pinnedGroups = computed(() =>
  tabGroups.value
    .filter(g => g.isPinned)
    .sort((a, b) => a.order - b.order)
    .map(group => ({
      group,
      threads: pinnedThreads.value.filter(t => tabGroupMap.value.get(t.id!) === group.id),
    }))
    .filter(g => g.threads.length > 0)
)

// Ungrouped pinned threads
const ungroupedPinnedThreads = computed(() => {
  const inGroup = new Set(pinnedGroups.value.flatMap(pg => pg.threads.map(t => t.id)))
  return pinnedThreads.value.filter(t => !inGroup.has(t.id))
})

// Unpinned groups
const unpinnedGroups = computed(() =>
  tabGroups.value
    .filter(g => !g.isPinned)
    .sort((a, b) => a.order - b.order)
    .map(group => ({
      group,
      threads: unpinnedThreads.value.filter(t => tabGroupMap.value.get(t.id!) === group.id),
    }))
    .filter(g => g.threads.length > 0)
)

// Time-based groups for ungrouped unpinned threads
const timeGroups = computed(() => {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterdayStart = todayStart - 86_400_000
  const weekAgoStart = todayStart - 7 * 86_400_000

  const unpinnedGroupedIds = new Set(
    unpinnedGroups.value.flatMap(ug => ug.threads.map(t => t.id))
  )

  const ungrouped = unpinnedThreads.value
    .filter(t => !unpinnedGroupedIds.has(t.id))
    .slice(0, displayCount.value)

  const today: ThreadListItem[] = []
  const yesterday: ThreadListItem[] = []
  const week: ThreadListItem[] = []
  const older: ThreadListItem[] = []

  for (const thread of ungrouped) {
    const ts = sortTs(thread)
    if (ts >= todayStart) today.push(thread)
    else if (ts >= yesterdayStart) yesterday.push(thread)
    else if (ts >= weekAgoStart) week.push(thread)
    else older.push(thread)
  }

  return [
    { label: 'Today', threads: today },
    { label: 'Yesterday', threads: yesterday },
    { label: 'Previous 7 Days', threads: week },
    { label: 'Older', threads: older },
  ].filter(g => g.threads.length > 0)
})

// Actions
function handlePin(threadId: string) {
  actor.send({ type: 'PIN_THREAD', threadId })
}

function handleUnpin(threadId: string) {
  actor.send({ type: 'UNPIN_THREAD', threadId })
}

function handleRename(threadId: string, topic: string | undefined) {
  const newName = prompt('Rename thread:', topic || '')
  if (newName?.trim()) {
    actor.send({ type: 'RENAME_THREAD', threadId, topic: newName.trim() })
  }
}

function handleArchive(threadId: string) {
  if (settings.value?.skipArchiveConfirm || confirm('Archive this thread? It will be hidden from all lists.')) {
    actor.send({ type: 'ARCHIVE_THREAD', threadId })
  }
}

function handleDelete(thread: ThreadListItem) {
  if (confirm(`Permanently delete thread "${thread.topic || 'Untitled'}"? This cannot be undone.`)) {
    actor.send({ type: 'DELETE_THREAD', threadId: thread.id! })
  }
}

function handleUnarchive(threadId: string) {
  actor.send({ type: 'UNARCHIVE_THREAD', threadId })
}

// Archive view
const showArchive = ref(false)
const archivedThreads = useSelector(actor, (state) => state.context.sidebarArchivedThreads)

function toggleArchive() {
  showArchive.value = !showArchive.value
  displayCount.value = BATCH_SIZE
  archiveDisplayCount.value = BATCH_SIZE
  if (showArchive.value) {
    trpc.bus.send.mutate({ systemId: id, type: 'GET_ARCHIVED_THREADS' })
  }
}
</script>
