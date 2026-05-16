<template>
  <div class="max-w-3xl">
    <div class="mb-8">
      <p class="text-sm text-neutral-500">Configure your LLM provider for the Hermes agent.</p>
    </div>

    <!-- Model -->
    <div class="space-y-4 mb-8">
      <h3 class="text-sm font-medium text-gray-300 uppercase tracking-wider">Default Model</h3>

      <div class="grid grid-cols-[1fr,400px] gap-y-3 gap-x-4 items-center">
        <div>
          <div class="text-sm font-medium text-gray-200">Provider</div>
          <p class="text-xs text-gray-500 mt-0.5">Active LLM provider</p>
        </div>
        <select
          v-model="provider"
          @change="save"
          class="w-full px-3 py-1.5 bg-neutral-800 border border-neutral-700/50 rounded-md text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 hover:border-neutral-600 transition-all"
        >
          <option v-for="p in providers" :key="p.key" :value="p.key">{{ p.label }}</option>
        </select>

        <div>
          <div class="text-sm font-medium text-gray-200">Model</div>
          <p class="text-xs text-gray-500 mt-0.5">Select a model or type a custom name</p>
        </div>
        <div class="relative">
          <input
            v-model="model"
            @change="save"
            @focus="showModelDropdown = true"
            @blur="hideDropdown"
            :placeholder="activeProvider?.modelPlaceholder"
            list="hermes-models"
            class="w-full px-3 py-1.5 bg-neutral-800 border border-neutral-700/50 rounded-md text-white placeholder-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 hover:border-neutral-600 transition-all"
          />
          <div
            v-if="showModelDropdown && filteredModels.length > 0"
            class="absolute z-10 top-full mt-1 w-full bg-neutral-900 border border-neutral-700 rounded-md shadow-xl max-h-48 overflow-auto"
          >
            <button
              v-for="m in filteredModels"
              :key="m"
              @mousedown.prevent="selectModel(m)"
              class="w-full text-left px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors"
            >
              {{ m }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="border-t border-neutral-800 my-8"></div>

    <!-- Providers -->
    <div class="space-y-4">
      <h3 class="text-sm font-medium text-gray-300 uppercase tracking-wider">Provider Keys</h3>

      <div class="grid grid-cols-[1fr,400px] gap-y-3 gap-x-4 items-center">
        <template v-for="p in providers" :key="p.key">
          <div>
            <div class="flex items-center">
              <span class="text-sm font-medium text-gray-200">{{ p.label }}</span>
              <div v-if="provider === p.key" class="flex items-center gap-1 ml-2">
                <div class="w-1 h-1 rounded-full bg-blue-400 flex-shrink-0"></div>
                <span class="text-[11px] font-medium text-blue-400/80">active</span>
              </div>
            </div>
            <p class="text-xs text-gray-500 mt-0.5">{{ p.description }}</p>
          </div>
          <div class="relative">
            <input
              :type="showKeys[p.key] ? 'text' : 'password'"
              v-model="keys[p.key]"
              @change="save"
              :placeholder="p.placeholder"
              class="w-full pr-10 px-3 py-1.5 bg-neutral-800 border border-neutral-700/50 rounded-md text-white placeholder-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 hover:border-neutral-600 transition-all"
            />
            <button
              @click="showKeys[p.key] = !showKeys[p.key]"
              type="button"
              class="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-700 rounded transition-colors"
            >
              <Eye v-if="!showKeys[p.key]" class="w-3.5 h-3.5 text-gray-400" />
              <EyeOff v-else class="w-3.5 h-3.5 text-gray-400" />
            </button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { Eye, EyeOff } from 'lucide-vue-next'
import { trpc } from '@/core/trpc'

const providers = [
  {
    key: 'openai', label: 'OpenAI', description: 'GPT-5.5, GPT-5.4, o4-mini, o3',
    placeholder: 'Enter OpenAI API key', modelPlaceholder: 'gpt-5.5',
    models: [
      'gpt-5.5', 'gpt-5.5-mini',
      'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-nano', 'gpt-5.4-pro',
      'gpt-5.3', 'gpt-5.2', 'gpt-5.1', 'gpt-5.1-mini',
      'gpt-5', 'gpt-5-mini', 'gpt-5-nano',
      'gpt-4.6', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano',
      'gpt-4o', 'gpt-4o-mini',
      'o4-mini', 'o3', 'o3-mini', 'o1', 'o1-mini',
    ],
  },
  {
    key: 'anthropic', label: 'Anthropic', description: 'Claude Opus 4.7, Sonnet 4.6, Haiku 4.5',
    placeholder: 'Enter Anthropic API key', modelPlaceholder: 'claude-sonnet-4-6',
    models: [
      'claude-opus-4-7', 'claude-opus-4-6', 'claude-opus-4-5',
      'claude-sonnet-4-6', 'claude-sonnet-4-5', 'claude-sonnet-4-20250514',
      'claude-haiku-4-5-20251001',
    ],
  },
]

interface Props {
  settings?: { config?: { provider?: string; model?: string; keys?: Record<string, string>; models?: Record<string, string>; apiKey?: string } }
}

const props = withDefaults(defineProps<Props>(), { settings: undefined })

const emit = defineEmits<{
  'update-setting': [{ path: string[]; value: any }]
}>()

const provider = ref(props.settings?.config?.provider || 'openai')
// Per-provider model memory
const models = reactive<Record<string, string>>({
  openai: props.settings?.config?.models?.openai || (props.settings?.config?.provider === 'openai' ? props.settings?.config?.model || '' : ''),
  anthropic: props.settings?.config?.models?.anthropic || (props.settings?.config?.provider === 'anthropic' ? props.settings?.config?.model || '' : ''),
})
const model = computed({
  get: () => models[provider.value] || '',
  set: (v: string) => { models[provider.value] = v },
})
const keys = reactive<Record<string, string>>({
  openai: props.settings?.config?.keys?.openai || props.settings?.config?.apiKey || '',
  anthropic: props.settings?.config?.keys?.anthropic || '',
})
const showKeys = reactive<Record<string, boolean>>({ openai: false, anthropic: false })
const showModelDropdown = ref(false)

const activeProvider = computed(() => providers.find(p => p.key === provider.value))
const filteredModels = computed(() => {
  const models = activeProvider.value?.models || []
  if (!model.value) return models
  return models.filter(m => m.toLowerCase().includes(model.value.toLowerCase()))
})

function selectModel(m: string) {
  model.value = m
  showModelDropdown.value = false
  save()
}

function hideDropdown() {
  setTimeout(() => { showModelDropdown.value = false }, 150)
}

function save() {
  const config = { provider: provider.value, model: model.value, models: { ...models }, keys: { ...keys } }
  emit('update-setting', { path: ['config'], value: config })
  // Hot-push active provider's key to bridge
  trpc.bus.send.mutate({
    systemId: 'hermes',
    type: 'HERMES_UPDATE_CONFIG',
    provider: provider.value,
    apiKey: keys[provider.value] || '',
    model: model.value,
  } as any)
}
</script>
