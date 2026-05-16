<template>
  <div class="max-w-3xl">
    <div class="mb-8">
      <h2 class="text-xl font-semibold text-white mb-2">Hermes Settings</h2>
      <p class="text-sm text-neutral-500">Configure your LLM provider for the Hermes agent.</p>
    </div>

    <!-- Provider Selection -->
    <div class="space-y-4">
      <h3 class="text-sm font-medium text-gray-300 uppercase tracking-wider">Provider</h3>

      <div class="grid grid-cols-[1fr,400px] gap-y-3 gap-x-4 items-center">
        <!-- OpenAI -->
        <div>
          <div class="flex items-center">
            <span
              class="text-sm font-medium transition-colors"
              :class="provider === 'openai' ? 'text-blue-400' : 'text-gray-200'"
            >OpenAI</span>
            <div v-if="provider === 'openai'" class="flex items-center gap-1 ml-2">
              <div class="w-1 h-1 rounded-full bg-blue-400"></div>
              <span class="text-[11px] font-medium text-blue-400/80">active</span>
            </div>
          </div>
          <p class="text-xs text-gray-500 mt-0.5">GPT-4o, GPT-4o-mini, o1, o3</p>
        </div>
        <div>
          <button
            v-if="provider !== 'openai'"
            @click="provider = 'openai'; save()"
            class="px-3 py-1.5 text-xs text-neutral-400 hover:text-neutral-200 border border-neutral-700 rounded-md hover:bg-neutral-800 transition-colors"
          >Select</button>
          <span v-else class="text-xs text-neutral-500">Selected</span>
        </div>

        <!-- Anthropic -->
        <div>
          <div class="flex items-center">
            <span
              class="text-sm font-medium transition-colors"
              :class="provider === 'anthropic' ? 'text-blue-400' : 'text-gray-200'"
            >Anthropic</span>
            <div v-if="provider === 'anthropic'" class="flex items-center gap-1 ml-2">
              <div class="w-1 h-1 rounded-full bg-blue-400"></div>
              <span class="text-[11px] font-medium text-blue-400/80">active</span>
            </div>
          </div>
          <p class="text-xs text-gray-500 mt-0.5">Claude Sonnet, Claude Opus, Claude Haiku</p>
        </div>
        <div>
          <button
            v-if="provider !== 'anthropic'"
            @click="provider = 'anthropic'; save()"
            class="px-3 py-1.5 text-xs text-neutral-400 hover:text-neutral-200 border border-neutral-700 rounded-md hover:bg-neutral-800 transition-colors"
          >Select</button>
          <span v-else class="text-xs text-neutral-500">Selected</span>
        </div>
      </div>
    </div>

    <div class="border-t border-neutral-800 my-8"></div>

    <!-- API Key -->
    <div class="space-y-4">
      <h3 class="text-sm font-medium text-gray-300 uppercase tracking-wider">API Key</h3>

      <div class="grid grid-cols-[1fr,400px] gap-y-3 gap-x-4 items-center">
        <div>
          <div class="text-sm font-medium text-gray-200">{{ providerLabel }} API Key</div>
          <p class="text-xs text-gray-500 mt-0.5">{{ provider === 'anthropic' ? 'Required for Claude models' : 'Required for GPT models' }}</p>
        </div>
        <div class="relative">
          <input
            :type="showKey ? 'text' : 'password'"
            v-model="apiKey"
            @change="save"
            :placeholder="`Enter ${providerLabel} API key`"
            class="w-full pr-10 px-3 py-1.5 bg-neutral-800 border border-neutral-700/50 rounded-md text-white placeholder-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 hover:border-neutral-600 transition-all"
          />
          <button
            @click="showKey = !showKey"
            type="button"
            class="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-700 rounded transition-colors"
          >
            <Eye v-if="!showKey" class="w-3.5 h-3.5 text-gray-400" />
            <EyeOff v-else class="w-3.5 h-3.5 text-gray-400" />
          </button>
        </div>
      </div>
    </div>

    <div class="border-t border-neutral-800 my-8"></div>

    <!-- Model -->
    <div class="space-y-4">
      <h3 class="text-sm font-medium text-gray-300 uppercase tracking-wider">Model</h3>

      <div class="grid grid-cols-[1fr,400px] gap-y-3 gap-x-4 items-center">
        <div>
          <div class="text-sm font-medium text-gray-200">Default Model</div>
          <p class="text-xs text-gray-500 mt-0.5">Used for new Hermes sessions</p>
        </div>
        <input
          v-model="model"
          @change="save"
          :placeholder="provider === 'anthropic' ? 'claude-sonnet-4-20250514' : 'gpt-4o-mini'"
          class="w-full px-3 py-1.5 bg-neutral-800 border border-neutral-700/50 rounded-md text-white placeholder-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 hover:border-neutral-600 transition-all"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
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

const providerLabel = computed(() => provider.value === 'anthropic' ? 'Anthropic' : 'OpenAI')

function save() {
  const config = { provider: provider.value, apiKey: apiKey.value, model: model.value }
  emit('update-setting', { path: ['config'], value: config })
  trpc.bus.send.mutate({ systemId: 'hermes', type: 'HERMES_UPDATE_CONFIG', ...config } as any)
}
</script>
