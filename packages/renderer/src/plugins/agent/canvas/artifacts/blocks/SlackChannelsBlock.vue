<template>
  <div class="slack-channels-block space-y-2">
    <div
      v-for="channel in channels"
      :key="channel.id"
      class="p-4 bg-neutral-900 rounded-lg border border-neutral-700 hover:border-primary-600/50 transition-colors cursor-pointer"
      @click="() => emit('channel-click', channel.id)"
    >
      <div class="flex items-start justify-between">
        <div class="flex items-start gap-3 flex-1">
          <Hash class="w-5 h-5 text-primary-400 flex-shrink-0 mt-0.5" />
          <div class="flex-1 min-w-0">
            <h4 class="text-sm font-semibold text-neutral-100 mb-1">#{{ channel.name }}</h4>
            <p v-if="channel.description" class="text-xs text-neutral-400 mb-2">
              {{ channel.description }}
            </p>
            <div v-if="channel.lastMessage" class="text-xs text-neutral-500 truncate">
              <span class="font-medium text-neutral-400">{{ channel.lastMessage.author }}:</span>
              {{ channel.lastMessage.text }}
            </div>
          </div>
        </div>

        <div class="flex flex-col items-end gap-2 ml-3">
          <span
            v-if="channel.unreadCount && channel.unreadCount > 0"
            class="px-2 py-0.5 bg-primary-600 text-white text-xs font-semibold rounded-full"
          >
            {{ channel.unreadCount }}
          </span>
          <span v-if="channel.lastMessage" class="text-xs text-neutral-500">
            {{ formatTime(channel.lastMessage.timestamp) }}
          </span>
        </div>
      </div>
    </div>

    <div v-if="!channels || channels.length === 0" class="p-8 text-center text-neutral-500">
      <p>No channels available</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Hash } from 'lucide-vue-next'

interface SlackMessage {
  author: string
  text: string
  timestamp: number
}

interface SlackChannel {
  id: string
  name: string
  description?: string
  unreadCount?: number
  lastMessage?: SlackMessage
}

interface Props {
  channels: SlackChannel[]
}

defineProps<Props>()

interface Emits {
  (e: 'channel-click', channelId: string): void
}

const emit = defineEmits<Emits>()

const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`

  return date.toLocaleDateString()
}
</script>
