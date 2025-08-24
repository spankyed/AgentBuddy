<template>
  <div class="group">
    <h3 class="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-4">
      Custom API Keys
    </h3>
    
    <!-- Custom keys list -->
    <div v-if="customKeys.length > 0" class="space-y-3 mb-4">
      <CustomApiKeyItem
        v-for="(key, index) in customKeys"
        :key="key.id"
        :config="key"
        @update="(config) => $emit('update', index, config)"
        @update-value="(config) => $emit('update-value', config)"
        @remove="() => $emit('remove', index)"
      />
    </div>
    
    <!-- Empty state -->
    <div v-else class="py-6 text-center bg-neutral-900/30 border border-dashed border-neutral-700/50 rounded-lg mb-4">
      <Key class="w-8 h-8 mx-auto mb-2 text-neutral-600" />
      <p class="text-sm text-neutral-500">No custom API keys configured</p>
      <p class="text-xs text-neutral-600 mt-1">Add custom keys for third-party services</p>
    </div>
    
    <!-- Add Custom Key Button -->
    <button
      @click="$emit('add')"
      class="px-4 py-2 bg-blue-500/10 border border-blue-500/30 rounded-lg text-blue-400 hover:bg-blue-500/20 hover:border-blue-500/50 transition-all flex items-center gap-2"
    >
      <Plus class="w-4 h-4" />
      Add Custom API Key
    </button>
  </div>
</template>

<script setup lang="ts">
import { Plus, Key } from 'lucide-vue-next'
import CustomApiKeyItem from './CustomApiKeyItem.vue'
import type { CustomApiKeyConfig } from './types'

interface Props {
  customKeys: CustomApiKeyConfig[]
}

defineProps<Props>()
defineEmits<{
  'add': []
  'update': [index: number, config: CustomApiKeyConfig]
  'update-value': [config: CustomApiKeyConfig]
  'remove': [index: number]
}>()
</script>