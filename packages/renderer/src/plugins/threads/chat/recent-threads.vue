<template>
  <div class="@container relative max-w-[80%] mx-auto pb-2" ref="containerRef">
    <div
      v-if="isOpen"
      class="absolute bottom-full mb-2 left-0 right-0 p-1 border border-neutral-700 bg-neutral-900 rounded-lg shadow-xl max-h-80 overflow-y-auto animate-slide-down z-50"
    >
      <div v-if="recentThreads.length === 0" class="py-8 text-center">
        <div class="flex flex-col items-center gap-1.5">
          <History :size="20" class="text-neutral-700" />
          <p class="text-sm text-neutral-400">No threads yet</p>
          <p class="text-xs text-neutral-600">Recent threads will appear here</p>
        </div>
      </div>
      <div v-else class="flex flex-col">
        <div
          v-for="thread in recentThreads"
          :key="thread.id"
          class="group flex items-center gap-3 w-full px-3 py-2 rounded-md cursor-pointer transition-colors hover:bg-neutral-800 hover:text-white"
          :class="thread.id === currentThread?.id ? 'bg-neutral-800/60' : ''"
          @click="handleSelectThread(thread.id)"
        >
          <span class="shrink-0 relative inline-block w-1.5 h-1.5">
            <span
              class="block w-full h-full rounded-full transition-colors"
              :class="isThreadBusy(thread.id) ? 'mosaic-dot' : ''"
              :style="!isThreadBusy(thread.id) ? { backgroundColor: getThreadDotColor(thread.id) || '#525252' } : undefined"
            />
            <span
              v-if="isThreadBusy(thread.id)"
              class="absolute inset-0 rounded-full scale-[2] mosaic-glow"
            />
          </span>
          <span class="flex-1 min-w-0 truncate text-sm text-neutral-300 group-hover:text-white">
            {{ thread.topic || 'Untitled' }}
          </span>
          <button
            v-if="thread.pinned"
            type="button"
            class="flex items-center px-1.5 py-1 text-neutral-600 hover:text-neutral-300 transition-colors"
            title="Unpin thread"
            @click.stop="handleUnpinThread(thread.id)"
          >
            <Pin :size="12" />
          </button>
          <button
            v-if="!thread.pinned"
            type="button"
            class="flex items-center px-1.5 py-1 text-neutral-600 hover:text-neutral-300 transition-colors opacity-0 group-hover:opacity-100"
            title="Pin thread"
            @click.stop="handlePinThread(thread.id)"
          >
            <Pin :size="12" />
          </button>
          <span class="shrink-0 text-xs tabular-nums text-neutral-600">
            {{ formatTime(thread.timestamp) }}
          </span>
          <div class="shrink-0 flex items-center gap-0.5 ml-1">
            <button
              type="button"
              class="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-neutral-400 hover:text-white hover:bg-neutral-700 transition-colors"
              title="Open thread artifacts"
              @click.stop="handleViewArtifacts(thread.id)"
            >
              <PanelLeft :size="12" />
              Artifacts
            </button>
            <button
              type="button"
              class="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-neutral-400 hover:text-white hover:bg-neutral-700 transition-colors"
              title="Open thread details"
              @click.stop="handleViewThread(thread.id)"
            >
              <FileText :size="12" />
              Details
            </button>
            <ContextMenuRoot v-if="!thread.pinned">
              <ContextMenuTrigger as-child>
                <button
                  type="button"
                  class="flex items-center gap-1.5 px-1.5 py-1 rounded text-xs text-neutral-400 hover:text-amber-400 hover:bg-amber-400/10 transition-colors"
                  title="Archive thread (right-click to delete)"
                  @click.stop="handleArchiveThread(thread.id)"
                >
                  <Archive :size="12" />
                  Archive
                </button>
              </ContextMenuTrigger>
              <ContextMenuPortal>
                <ContextMenuContent
                  class="bg-neutral-800 border border-neutral-700 rounded-md p-1 min-w-[120px] shadow-[0_10px_38px_-10px_rgba(0,0,0,0.75),0_10px_20px_-15px_rgba(0,0,0,0.4)] z-50"
                  :side-offset="2"
                >
                  <ContextMenuItem
                    class="flex items-center gap-2 px-3 py-2 text-sm rounded cursor-pointer text-red-400 hover:bg-neutral-700 transition-colors outline-none"
                    @select="handleDeleteThread(thread.id)"
                  >
                    <Trash2 :size="14" />
                    Delete
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenuPortal>
            </ContextMenuRoot>
          </div>
        </div>
      </div>
    </div>

    <div class="-mt-4 pt-4 flex items-center content-between cursor-pointer" @click="isOpen = !isOpen">
      <button
        type="button"
        class="flex items-center px-5 pb-2 text-sm transition-colors text-neutral-500 hover:text-neutral-200"
      >
        <History v-if="!isOpen" :size="16" class="mr-2" />
        <ChevronUp v-else :size="16" class="mr-2" />

        Recent<span class="hidden @md:inline">&nbsp;Threads</span>
      </button>

      <div class="flex-grow min-w-0 px-2 @md:px-12 pb-2 text-sm text-center text-neutral-500 cursor-pointer">
        <span
          v-if="currentThread?.topic"
          class="group inline-flex items-center justify-center gap-2 max-w-full"
        >
          <PanelLeft :size="14" class="shrink-0 cursor-pointer transition-colors hover:text-neutral-200" title="Toggle inline dashboard" @click.stop="handleToggleInlineDashboard" />
          <span class="hidden @md:inline truncate cursor-pointer transition-colors hover:text-neutral-200 hover:underline underline-offset-4 decoration-neutral-600" title="Thread Artifacts" @click.stop="handleViewDashboard">{{ currentThread?.topic }}</span>
        </span>
      </div>

      <ContextMenuRoot>
        <ContextMenuTrigger as-child>
          <button
            type="button"
            class="flex items-center px-5 pb-2 text-sm transition-colors text-neutral-500 hover:text-neutral-200"
            @click.stop="handleNewThread"
          >
            <Plus :size="16" class="mr-2" />
            New<span class="hidden @md:inline">&nbsp;thread</span>
          </button>
        </ContextMenuTrigger>

        <ContextMenuPortal>
          <ContextMenuContent
            class="w-fit bg-neutral-900 border border-neutral-700 rounded-md shadow-lg py-1 z-50"
          >
            <ContextMenuSub>
              <ContextMenuSubTrigger
                class="flex items-center gap-2 px-3 py-2 text-sm transition-colors cursor-pointer text-neutral-200 hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none data-[state=open]:bg-neutral-800"
              >
                <FolderOpen class="w-4 h-4" />
                <span class="flex-1">In Project</span>
                <ChevronRight class="w-3 h-3 text-neutral-500" />
              </ContextMenuSubTrigger>
              <ContextMenuSubContent
                class="min-w-[200px] bg-neutral-900 border border-neutral-700 rounded-md shadow-lg py-1 z-50"
                :side-offset="4"
              >
                <ContextMenuItem
                  @select="$emit('new-thread-no-project')"
                  class="flex items-center gap-2 px-3 py-2 text-sm transition-colors cursor-pointer text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 focus:bg-neutral-800 focus:outline-none"
                >
                  No project (ask me)
                </ContextMenuItem>
                <ContextMenuSeparator v-if="projects.length > 0" class="h-[1px] bg-neutral-700 my-1" />
                <ContextMenuItem
                  v-for="project in projects"
                  :key="project.name"
                  @select="$emit('new-thread-in-project', project.directories[0])"
                  class="flex items-center gap-2 px-3 py-2 text-sm transition-colors cursor-pointer text-neutral-200 hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none"
                >
                  <span class="w-2 h-2 rounded-full shrink-0" :style="{ backgroundColor: project.color }" />
                  <span class="truncate">{{ project.name }}</span>
                </ContextMenuItem>
                <div v-if="projects.length === 0" class="px-3 py-2 text-xs text-neutral-500 italic">
                  No projects configured
                </div>
              </ContextMenuSubContent>
            </ContextMenuSub>

            <ContextMenuSeparator class="h-[1px] bg-neutral-700 my-1" />

            <ContextMenuSub>
              <ContextMenuSubTrigger
                class="flex items-center gap-2 px-3 py-2 text-sm transition-colors cursor-pointer text-neutral-200 hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none data-[state=open]:bg-neutral-800"
              >
                <GitBranchPlus class="w-4 h-4" />
                <span class="flex-1">As Child of</span>
                <ChevronRight class="w-3 h-3 text-neutral-500" />
              </ContextMenuSubTrigger>
              <ContextMenuSubContent
                class="min-w-[200px] bg-neutral-900 border border-neutral-700 rounded-md shadow-lg py-1 z-50"
                :side-offset="4"
              >
                <ContextMenuItem
                  v-for="projectThread in recentThreads"
                  :key="projectThread.id"
                  @select="$emit('new-thread-as-child', projectThread.id)"
                  class="flex items-center gap-2 px-3 py-2 text-sm transition-colors cursor-pointer text-neutral-200 hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none"
                >
                  <div class="flex items-center gap-2 flex-1 min-w-0">
                    <span class="text-xs font-medium text-neutral-500">{{ projectThread.shortCode }}</span>
                    <span class="truncate">{{ projectThread.topic || 'Untitled' }}</span>
                  </div>
                </ContextMenuItem>
                <div v-if="recentThreads.length === 0" class="px-3 py-2 text-sm text-neutral-500 italic">
                  No threads available
                </div>
              </ContextMenuSubContent>
            </ContextMenuSub>
          </ContextMenuContent>
        </ContextMenuPortal>
      </ContextMenuRoot>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { Archive, History, ChevronUp, ChevronRight, Plus, PanelLeft, FileText, Pin, Trash2, FolderOpen, GitBranchPlus } from 'lucide-vue-next'
import type { ThreadEntity } from '@app/api';
import type { AgentThreadData } from '@app/api'
import {
  ContextMenuRoot,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuPortal,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
} from 'reka-ui'
import { applicationState } from '@/main'
import { useSelector } from '@xstate/vue'
import { id as threadsId, type ThreadsState } from '@/plugins/threads/state'

export interface ThreadsProps {
  currentThread: AgentThreadData | null;
  recentThreads: ThreadEntity[]
}

const props = defineProps<ThreadsProps>()
const isOpen = ref(false)
const containerRef = ref<HTMLDivElement | null>(null)

// Get threads from the threads plugin state
const threadsActor: ThreadsState = applicationState.system.get(threadsId)
const chatStates = useSelector(threadsActor, (state) => state.context.chatStates)
const chatStateOverrides = useSelector(threadsActor, (state) => state.context.chatStateOverrides)
const settings = useSelector(threadsActor, (state) => state.context.settings)

function getThreadStateConfig(threadId: string) {
  const override = chatStateOverrides.value[threadId]
  const activeStateId = (override && override.expiresAt > Date.now())
    ? override.id
    : (chatStates.value[threadId] || 'idle')
  return settings.value?.chatStates?.find(c => c.id === activeStateId)
}

function getThreadDotColor(threadId: string): string | undefined {
  return getThreadStateConfig(threadId)?.color
}

function isThreadBusy(threadId: string): boolean {
  return getThreadStateConfig(threadId)?.busy ?? false
}

const recentThreads = computed(() => props.recentThreads)

const handleClickOutside = (event: MouseEvent) => {
  if (containerRef.value && !containerRef.value.contains(event.target as Node)) {
    isOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})

const emit = defineEmits<{
  (e: 'view-thread', threadId: string): void
  (e: 'open-thread-chat', threadId: string): void
  (e: 'view-dashboard'): void
  (e: 'toggle-inline-dashboard'): void
  (e: 'view-artifacts', threadId: string): void
  (e: 'new-thread'): void
  (e: 'new-thread-as-child', parentThreadId: string): void
  (e: 'new-thread-in-project', directory: string): void
  (e: 'new-thread-no-project'): void
}>()

// Read projects from settings for the "New Thread in Project" submenu
const settingsActor = applicationState.system.get('settings')
const projects = useSelector(settingsActor, (state: any) =>
  (state.context.settings?.general?.projects || []) as Array<{ name: string; directories: string[]; color: string }>
)

const handleArchiveThread = (id: string | undefined) => {
  if (!id) return
  const confirmed = confirm('Archive this thread? It will be hidden from all lists.')
  if (confirmed) {
    threadsActor.send({ type: 'ARCHIVE_THREAD', threadId: id })
    isOpen.value = false
  }
}

const handleUnpinThread = (id: string | undefined) => {
  if (!id) return
  threadsActor.send({ type: 'UNPIN_THREAD', threadId: id })
}

const handlePinThread = (id: string | undefined) => {
  if (!id) return
  threadsActor.send({ type: 'PIN_THREAD', threadId: id })
}

const handleDeleteThread = (id: string | undefined) => {
  if (!id) return
  const thread = recentThreads.value.find(t => t.id === id)
  const confirmed = confirm(`Permanently delete thread "${thread?.topic || 'Untitled'}"? This cannot be undone.`)
  if (confirmed) {
    threadsActor.send({ type: 'DELETE_THREAD', threadId: id })
    isOpen.value = false
  }
}

const handleViewThread = (id: string | undefined) => {
  if (!id) return
  emit('view-thread', id)
  isOpen.value = false
}

const handleViewArtifacts = (id: string | undefined) => {
  if (!id) return
  emit('view-artifacts', id)
  isOpen.value = false
}

const handleViewDashboard = () => {
  if (!props.currentThread?.id) return
  emit('view-dashboard')
  isOpen.value = false
}

const handleToggleInlineDashboard = () => {
  if (!props.currentThread?.id) return
  emit('toggle-inline-dashboard')
}

const handleSelectThread = (id: string | undefined) => {
  if (!id) return
  emit('open-thread-chat', id)
  isOpen.value = false
}

const handleNewThread = () => {
  emit('new-thread')
  isOpen.value = false
}

const formatTime = (timestamp: Date | number | string) => {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  })
}
</script>
