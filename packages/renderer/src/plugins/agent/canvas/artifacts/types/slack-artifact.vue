<template>
  <div class="max-w-4xl">
    <div class="p-6 rounded-lg shadow-md bg-neutral-850 animate-fade-in">
      <h3 class="flex items-center mb-4 space-x-2 text-lg font-semibold text-white">
        <MessageSquare :size="20" />
        <span>{{ artifact.title || 'Slack Channel Recap' }}</span>
      </h3>
      
      <!-- Dynamic Slack Channels -->
      <div v-if="channels && channels.length > 0" class="space-y-4">
        <div 
          v-for="channel in channels" 
          :key="channel.name"
          class="p-4 rounded-lg bg-neutral-800/50"
        >
          <div class="flex items-start justify-between mb-2">
            <h4 class="font-medium text-white">{{ channel.name }}</h4>
            <span 
              v-if="channel.unreadCount > 0"
              class="text-xs text-neutral-400"
            >
              {{ channel.unreadCount }} unread
            </span>
            <span v-else class="text-xs text-neutral-500">No unread</span>
          </div>
          <p v-if="channel.lastMessage" class="text-sm text-neutral-300">
            <span class="font-medium">{{ channel.lastMessage.author }}:</span> 
            {{ channel.lastMessage.text }}
          </p>
          <p v-if="channel.lastMessage" class="mt-1 text-xs text-neutral-500">
            Last message: {{ channel.lastMessage.time }}
          </p>
        </div>
      </div>
      
      <!-- Empty state -->
      <div v-else class="text-center py-8">
        <p class="text-neutral-400">No channels to display</p>
      </div>
      
      <div v-if="channels && channels.length > 0" class="mt-6 text-center">
        <button class="text-sm text-blue-400 transition-colors hover:text-blue-300">
          View all channels →
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { MessageSquare } from 'lucide-vue-next';
import type { ArtifactItem } from '@app/api';

interface SlackChannel {
  name: string;
  unreadCount: number;
  lastMessage?: {
    author: string;
    text: string;
    time: string;
  };
}

interface SlackContent {
  channels: SlackChannel[];
}

const props = defineProps<{
  artifact: ArtifactItem;
}>();

// Extract channels from artifact content
const channels = computed(() => {
  const content = props.artifact.content as SlackContent;
  return content?.channels || [];
});
</script>