<template>
  <div class="max-w-4xl mx-auto">
    <div class="p-6 rounded-lg shadow-md bg-neutral-900 animate-fade-in">
      <h3 class="flex items-center mb-4 space-x-2 text-lg font-semibold text-white">
        <MessageSquare :size="20" />
        <span>Slack Channel Recap</span>
      </h3>
      
      <!-- Mock Slack Channels -->
      <div class="space-y-4">
        <div class="p-4 rounded-lg bg-neutral-800/50">
          <div class="flex items-start justify-between mb-2">
            <h4 class="font-medium text-white">#general</h4>
            <span class="text-xs text-neutral-400">3 unread</span>
          </div>
          <p class="text-sm text-neutral-300">
            <span class="font-medium">@john:</span> Hey team, the new deployment went smoothly!
          </p>
          <p class="mt-1 text-xs text-neutral-500">Last message: 2 hours ago</p>
        </div>
        
        <div class="p-4 rounded-lg bg-neutral-800/50">
          <div class="flex items-start justify-between mb-2">
            <h4 class="font-medium text-white">#dev-team</h4>
            <span class="text-xs text-neutral-400">7 unread</span>
          </div>
          <p class="text-sm text-neutral-300">
            <span class="font-medium">@sarah:</span> Can someone review my PR for the auth fix?
          </p>
          <p class="mt-1 text-xs text-neutral-500">Last message: 45 minutes ago</p>
        </div>
        
        <div class="p-4 rounded-lg bg-neutral-800/50">
          <div class="flex items-start justify-between mb-2">
            <h4 class="font-medium text-white">#product-updates</h4>
            <span class="text-xs text-neutral-400">12 unread</span>
          </div>
          <p class="text-sm text-neutral-300">
            <span class="font-medium">@productbot:</span> New feature request: Dark mode support
          </p>
          <p class="mt-1 text-xs text-neutral-500">Last message: 3 hours ago</p>
        </div>
      </div>
      
      <div class="mt-6 text-center">
        <button class="text-sm text-blue-400 transition-colors hover:text-blue-300">
          View all channels →
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { MessageSquare } from 'lucide-vue-next';
import type { ArtifactItem } from '@abuddy/api';

defineProps<{
  artifact: ArtifactItem;
}>();
</script>