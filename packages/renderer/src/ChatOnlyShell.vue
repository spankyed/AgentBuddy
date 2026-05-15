<template>
  <div class="flex flex-col h-screen bg-[rgb(28,28,28)]">
    <!-- Draggable titlebar -->
    <div
      class="flex items-center gap-2 shrink-0 select-none"
      :class="isMac ? 'pl-[78px] pr-3 h-[42px]' : 'px-3 h-[38px]'"
      style="-webkit-app-region: drag"
    >
      <span class="text-sm text-neutral-400 truncate" style="-webkit-app-region: no-drag">
        {{ threadTopic || 'Chat' }}
      </span>
    </div>
    <!-- Chat component -->
    <div class="flex-1 min-h-0">
      <Chat />
    </div>
  </div>
</template>

<script setup lang="ts">
import { watch } from 'vue'
import { useSelector } from '@xstate/vue'
import { applicationState } from '@/main'
import { id } from '@/plugins/threads/state'
import type { ThreadsState } from '@/plugins/threads/state'
import Chat from '@/plugins/threads/chat/chat.vue'
import type { AgentThreadData } from '@app/api'

const chatThreadId = window.electronAPI?.chatThreadId
const isMac = navigator.platform.toLowerCase().includes('mac')

const actor: ThreadsState = applicationState.system.get(id)
const currentThread = useSelector(actor, (state) => state.context.currentThread as AgentThreadData | undefined)
const threadTopic = useSelector(actor, (state) => (state.context.currentThread as AgentThreadData | undefined)?.topic)

// Wait for startup data (AGENT_CONNECTED), then open the target thread
const chatSettings = useSelector(actor, (state) => state.context.chatSettings)
let opened = false
watch(chatSettings, (settings) => {
  if (settings && chatThreadId && !opened) {
    opened = true
    actor.send({ type: 'OPEN_THREAD_CHAT', threadId: chatThreadId })
  }
}, { immediate: true })
</script>
