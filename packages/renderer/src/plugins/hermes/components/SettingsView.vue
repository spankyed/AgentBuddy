<template>
  <div class="p-8">
    <h2 class="text-lg font-medium text-neutral-100 mb-4">Settings</h2>

    <div class="space-y-6 max-w-lg">
      <!-- LLM Provider -->
      <div>
        <h3 class="text-sm font-medium text-neutral-300 mb-3">LLM Provider</h3>
        <div class="space-y-3">
          <div>
            <label class="block text-xs text-neutral-500 mb-1">Provider</label>
            <select
              v-model="provider"
              @change="saveConfig"
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
                @change="saveConfig"
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
              @change="saveConfig"
              placeholder="gpt-4o-mini"
              class="w-full px-3 py-1.5 bg-neutral-800 border border-neutral-700 rounded-md text-sm text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-primary-500"
            />
          </div>
        </div>
      </div>

      <!-- Connection -->
      <div>
        <h3 class="text-sm font-medium text-neutral-300 mb-3">Connection</h3>
        <div class="space-y-3">
          <div class="flex items-center gap-2">
            <div :class="['w-2 h-2 rounded-full', connectionStatus === 'connected' ? 'bg-green-500' : 'bg-neutral-500']" />
            <span class="text-sm text-neutral-300">{{ connectionStatus }}</span>
          </div>
          <div v-if="agentDir" class="text-xs text-neutral-500 font-mono bg-neutral-800 px-3 py-2 rounded border border-neutral-700">
            {{ agentDir }}
          </div>
        </div>
      </div>

      <!-- About -->
      <div>
        <h3 class="text-sm font-medium text-neutral-300 mb-3">About</h3>
        <p class="text-xs text-neutral-500 leading-relaxed">
          Hermes Agent is an autonomous AI agent framework by Nous Research.
          Configure your LLM provider above, then start the bridge to begin chatting.
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Eye, EyeOff } from 'lucide-vue-next'

const props = defineProps<{
  connectionStatus: 'connected' | 'disconnected' | 'error'
  agentDir: string | null
  hermesConfig: { provider?: string; apiKey?: string; model?: string }
}>()

const emit = defineEmits<{
  updateConfig: [config: { provider: string; apiKey: string; model: string }]
}>()

const provider = ref(props.hermesConfig?.provider || 'openai')
const apiKey = ref(props.hermesConfig?.apiKey || '')
const model = ref(props.hermesConfig?.model || '')
const showKey = ref(false)

function saveConfig() {
  emit('updateConfig', {
    provider: provider.value,
    apiKey: apiKey.value,
    model: model.value,
  })
}
</script>
