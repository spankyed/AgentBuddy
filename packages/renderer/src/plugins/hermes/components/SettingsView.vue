<template>
  <div class="p-8">
    <h2 class="text-lg font-medium text-neutral-100 mb-4">Settings</h2>

    <div class="space-y-6 max-w-lg">
      <!-- Connection -->
      <div>
        <h3 class="text-sm font-medium text-neutral-300 mb-3">Connection</h3>
        <div class="space-y-3">
          <div>
            <label class="block text-xs text-neutral-500 mb-1">Status</label>
            <div class="flex items-center gap-2">
              <div
                :class="[
                  'w-2 h-2 rounded-full',
                  connectionStatus === 'connected' ? 'bg-green-500' : 'bg-neutral-500'
                ]"
              />
              <span class="text-sm text-neutral-300">{{ connectionStatus }}</span>
            </div>
          </div>

          <div v-if="agentDir">
            <label class="block text-xs text-neutral-500 mb-1">Agent Directory</label>
            <div class="text-sm text-neutral-300 font-mono text-xs bg-neutral-800 px-3 py-2 rounded border border-neutral-700">
              {{ agentDir }}
            </div>
          </div>
        </div>
      </div>

      <!-- Info -->
      <div>
        <h3 class="text-sm font-medium text-neutral-300 mb-3">About</h3>
        <p class="text-xs text-neutral-500 leading-relaxed">
          Hermes Agent is an autonomous AI agent framework by Nous Research.
          This plugin provides a management interface for skills, persona, memory,
          and tools. Chat with Hermes by selecting "Hermes" mode in a thread.
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  connectionStatus: string
  agentDir: string | null
}>()
</script>
