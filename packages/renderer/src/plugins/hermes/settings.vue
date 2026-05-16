<template>
  <div class="max-w-xl space-y-6">
    <div>
      <h3 class="text-sm font-medium text-neutral-300 mb-3">LLM Provider</h3>
      <div class="space-y-3">
        <div>
          <label class="block text-xs text-neutral-500 mb-1">Provider</label>
          <select
            v-model="provider"
            @change="save"
            class="w-full px-3 py-1.5 bg-neutral-800 border border-neutral-700 rounded-md text-sm text-neutral-200 focus:outline-none focus:border-primary-500"
          >
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
          </select>
        </div>

        <div>
          <label class="block text-xs text-neutral-500 mb-1">API Key</label>
          <div class="relative">
            <input
              :type="showKey ? 'text' : 'password'"
              v-model="apiKey"
              @change="save"
              placeholder="sk-..."
              class="w-full pr-10 px-3 py-1.5 bg-neutral-800 border border-neutral-700 rounded-md text-sm text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-primary-500"
            />
            <button
              @click="showKey = !showKey"
              type="button"
              class="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-neutral-700 rounded transition-colors"
            >
              <EyeOff v-if="showKey" class="w-3.5 h-3.5 text-neutral-400" />
              <Eye v-else class="w-3.5 h-3.5 text-neutral-400" />
            </button>
          </div>
        </div>

        <div>
          <label class="block text-xs text-neutral-500 mb-1">Model</label>
          <input
            v-model="model"
            @change="save"
            placeholder="gpt-4o-mini"
            class="w-full px-3 py-1.5 bg-neutral-800 border border-neutral-700 rounded-md text-sm text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-primary-500"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Eye, EyeOff } from 'lucide-vue-next'
import { trpc } from '@/core/trpc'

interface Props {
  settings?: { config?: { provider?: string; apiKey?: string; model?: string } }
}

const props = withDefaults(defineProps<Props>(), {
  settings: undefined
})

const emit = defineEmits<{
  'update-setting': [{ path: string[]; value: any }]
}>()

const provider = ref(props.settings?.config?.provider || 'openai')
const apiKey = ref(props.settings?.config?.apiKey || '')
const model = ref(props.settings?.config?.model || '')
const showKey = ref(false)

function save() {
  const config = { provider: provider.value, apiKey: apiKey.value, model: model.value }
  // Persist to EARS via standard settings path
  emit('update-setting', { path: ['config'], value: config })
  // Hot-push to running bridge
  trpc.bus.send.mutate({ systemId: 'hermes', type: 'HERMES_UPDATE_CONFIG', ...config } as any)
}
</script>
