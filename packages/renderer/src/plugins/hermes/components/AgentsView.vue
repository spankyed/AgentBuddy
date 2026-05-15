<template>
  <div class="p-8">
    <h2 class="text-lg font-medium text-neutral-100 mb-4">Agents</h2>

    <div class="space-y-4">
      <!-- Connection Info -->
      <div class="p-4 bg-neutral-800 rounded-lg border border-neutral-700">
        <h3 class="text-sm font-medium text-neutral-200 mb-2">Hermes Agent</h3>
        <div class="space-y-2 text-sm text-neutral-400">
          <div class="flex items-center gap-2">
            <span class="text-neutral-500">Status:</span>
            <span :class="connectionStatus === 'connected' ? 'text-green-400' : 'text-neutral-500'">
              {{ connectionStatus }}
            </span>
          </div>
          <div v-if="agentDir" class="flex items-center gap-2">
            <span class="text-neutral-500">Agent Dir:</span>
            <span class="font-mono text-xs">{{ agentDir }}</span>
          </div>
        </div>
      </div>

      <!-- Models -->
      <div v-if="models.length > 0" class="p-4 bg-neutral-800 rounded-lg border border-neutral-700">
        <h3 class="text-sm font-medium text-neutral-200 mb-2">Available Models</h3>
        <div class="space-y-1">
          <div
            v-for="model in models"
            :key="model.name"
            class="flex items-center justify-between py-1 text-sm"
          >
            <span class="text-neutral-300">{{ model.name }}</span>
            <span class="text-xs text-neutral-500">{{ model.provider }}</span>
          </div>
        </div>
      </div>

      <!-- Workspaces -->
      <div v-if="workspaces.length > 0" class="p-4 bg-neutral-800 rounded-lg border border-neutral-700">
        <h3 class="text-sm font-medium text-neutral-200 mb-2">Workspaces</h3>
        <div class="space-y-1">
          <div
            v-for="ws in workspaces"
            :key="ws"
            class="py-1 text-sm text-neutral-300 font-mono text-xs"
          >
            {{ ws }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  connectionStatus: string
  agentDir: string | null
  models: Array<{ name: string; provider: string; model: string }>
  workspaces: string[]
}>()
</script>
