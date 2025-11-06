<template>
  <div class="workspace-config-block p-4 bg-neutral-900 rounded-lg border border-neutral-700">
    <div class="space-y-3">
      <div v-if="config.path" class="flex items-start gap-3">
        <Folder class="w-5 h-5 text-primary-400 flex-shrink-0 mt-0.5" />
        <div class="flex-1">
          <p class="text-xs text-neutral-400 mb-1">Workspace Path</p>
          <p class="text-sm text-neutral-200 font-mono break-all">{{ config.path }}</p>
        </div>
      </div>

      <div v-if="config.name" class="flex items-start gap-3">
        <FileText class="w-5 h-5 text-primary-400 flex-shrink-0 mt-0.5" />
        <div class="flex-1">
          <p class="text-xs text-neutral-400 mb-1">Workspace Name</p>
          <p class="text-sm text-neutral-200">{{ config.name }}</p>
        </div>
      </div>

      <div v-if="config.description" class="flex items-start gap-3">
        <Info class="w-5 h-5 text-primary-400 flex-shrink-0 mt-0.5" />
        <div class="flex-1">
          <p class="text-xs text-neutral-400 mb-1">Description</p>
          <p class="text-sm text-neutral-300">{{ config.description }}</p>
        </div>
      </div>

      <div v-if="config.settings && Object.keys(config.settings).length > 0" class="pt-3 border-t border-neutral-700">
        <p class="text-xs text-neutral-400 mb-2">Configuration</p>
        <div class="space-y-2">
          <div
            v-for="(value, key) in config.settings"
            :key="key"
            class="flex items-center justify-between py-2 px-3 bg-neutral-800 rounded-lg"
          >
            <span class="text-sm text-neutral-300">{{ key }}</span>
            <span class="text-sm text-primary-400 font-mono">{{ formatValue(value) }}</span>
          </div>
        </div>
      </div>

      <div v-if="config.files && config.files.length > 0" class="pt-3 border-t border-neutral-700">
        <p class="text-xs text-neutral-400 mb-2">Files</p>
        <div class="space-y-1">
          <div
            v-for="(file, index) in config.files"
            :key="index"
            class="flex items-center gap-2 py-1.5 px-3 bg-neutral-800 rounded-lg text-sm text-neutral-300"
          >
            <FileCode class="w-4 h-4 text-primary-400" />
            <span class="font-mono">{{ file }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Folder, FileText, Info, FileCode } from 'lucide-vue-next'

interface WorkspaceConfig {
  path?: string
  name?: string
  description?: string
  settings?: Record<string, any>
  files?: string[]
}

interface Props {
  config: WorkspaceConfig
}

defineProps<Props>()

const formatValue = (value: any): string => {
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
  }
  if (typeof value === 'object') {
    return JSON.stringify(value)
  }
  return String(value)
}
</script>
