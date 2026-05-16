<template>
  <div class="p-8">
    <h2 class="text-lg font-medium text-neutral-100 mb-4">Tools</h2>

    <div v-if="tools.length > 0" class="space-y-1">
      <div
        v-for="tool in tools"
        :key="tool.name"
        class="flex items-center justify-between p-3 bg-neutral-800 rounded-lg border border-neutral-700"
      >
        <div>
          <span class="text-sm text-neutral-200">{{ tool.name }}</span>
          <p v-if="tool.description" class="text-xs text-neutral-500 mt-0.5">
            {{ tool.description }}
          </p>
        </div>
        <div
          :class="[
            'px-2 py-0.5 rounded text-xs',
            tool.enabled
              ? 'bg-green-500/20 text-green-400'
              : 'bg-neutral-700 text-neutral-500'
          ]"
        >
          {{ tool.enabled ? 'Enabled' : 'Disabled' }}
        </div>
      </div>
    </div>

    <div v-else class="text-sm text-neutral-500 text-center py-12">
      No tools found. Start the bridge to discover available tools.
    </div>

    <div v-if="enabledToolsets.length > 0" class="mt-6">
      <h3 class="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-2">Enabled Toolsets</h3>
      <div class="flex flex-wrap gap-2">
        <span
          v-for="ts in enabledToolsets"
          :key="ts"
          class="px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-xs text-neutral-300"
        >
          {{ ts }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  tools: Array<{ name: string; enabled: boolean; description: string }>
  enabledToolsets: string[]
}>()
</script>
