<template>
  <div class="max-w-3xl">
    <!-- Header Section -->
    <div class="mb-8">
      <h2 class="text-xl font-semibold text-white mb-2">Secrets</h2>
      <p class="text-sm text-neutral-500">
        Manage your API keys for various providers. Keys are stored securely in a separate database partition.
      </p>
    </div>

    <!-- CLI Providers -->
    <CliProviders :settings="settings" @update-setting="(e: any) => emit('update-setting', e)" />

    <!-- Divider -->
    <div class="border-t border-neutral-800 my-8"></div>

    <!-- Standard Providers -->
    <div class="space-y-4">
      <h3 class="text-sm font-medium text-gray-300 uppercase tracking-wider">Standard Providers</h3>

      <div class="grid grid-cols-[1fr,400px,80px] gap-y-3 gap-x-4 items-center" data-onboarding-id="settings-secrets-section">
        <template v-for="provider in standardProviders" :key="provider.key">
          <!-- Provider Info Column -->
          <div>
            <div class="flex items-center">
              <button
                @click="openProviderUrl(provider.url)"
                class="flex items-center gap-1 text-sm font-medium text-gray-200 hover:text-blue-400 transition-colors group"
                :title="`Open ${provider.label} API keys page`"
              >
                {{ provider.label }}
                <ExternalLink class="w-3 h-3 text-gray-400 group-hover:text-blue-400 transition-colors" />
              </button>
              <div
                v-if="provider.priority"
                class="flex items-center gap-1 ml-2"
              >
                <div
                  :class="{
                    'w-1 h-1 rounded-full flex-shrink-0': true,
                    'bg-red-400': provider.priority === 'required',
                    'bg-amber-400': provider.priority === 'recommended'
                  }"
                ></div>
                <span
                  :class="{
                    'text-[11px] font-medium': true,
                    'text-red-400/80': provider.priority === 'required',
                    'text-amber-400/80': provider.priority === 'recommended'
                  }"
                >
                  {{ provider.priority }}
                </span>
              </div>
            </div>
            <p class="text-xs text-gray-500 mt-0.5">{{ provider.description }}</p>
          </div>

          <!-- Input/Display Column -->
          <div :data-onboarding-id="`settings-${provider.key}-key-input`">
            <div v-if="getSecretForProvider(provider.key) && !isEditing(provider.key)">
              <span class="w-full inline-block text-center text-xs text-gray-500 bg-neutral-800 px-3 py-1.5 rounded-md border border-neutral-700">••••••••</span>
            </div>
            <div v-else class="relative">
              <input
                :type="showKeyFor[provider.key] ? 'text' : 'password'"
                v-model="inlineKeyValues[provider.key]"
                :placeholder="provider.placeholder"
                @input="handleKeyInput(provider.key)"
                @keyup.enter="saveInlineKey(provider.key)"
                @keyup.escape="cancelEdit(provider.key)"
                class="w-full pr-10 px-3 py-1.5 bg-neutral-800 border border-neutral-700/50 rounded-md text-white placeholder-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 hover:border-neutral-600 transition-all"
              />
              <button @click="toggleKeyVisibility(provider.key)"
                      type="button"
                      class="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-700 rounded transition-colors">
                <Eye v-if="!showKeyFor[provider.key]" class="w-3.5 h-3.5 text-gray-400" />
                <EyeOff v-else class="w-3.5 h-3.5 text-gray-400" />
              </button>
            </div>
          </div>

          <!-- Action Buttons Column -->
          <div class="flex justify-end">
            <div v-if="getSecretForProvider(provider.key) && !isEditing(provider.key)" class="flex gap-1">
              <button @click="startEdit(provider.key)"
                      class="p-1.5 hover:bg-neutral-800 rounded-md transition-colors"
                      title="Edit key">
                <Edit2 class="w-3.5 h-3.5 text-gray-400" />
              </button>
              <button @click="deleteKey(provider.key)"
                      class="p-1.5 hover:bg-neutral-800 rounded-md transition-colors"
                      title="Delete key">
                <Trash2 class="w-3.5 h-3.5 text-red-400" />
              </button>
            </div>
            <div v-else-if="isEditing(provider.key)" class="flex gap-1">
              <button @click="saveInlineKey(provider.key)"
                      :disabled="!inlineKeyValues[provider.key]?.trim()"
                      class="p-1.5 hover:bg-neutral-800 rounded-md transition-colors"
                      title="Save">
                <Check class="w-3.5 h-3.5 text-green-400" />
              </button>
              <button @click="cancelEdit(provider.key)"
                      class="p-1.5 hover:bg-neutral-800 rounded-md transition-colors"
                      title="Cancel">
                <X class="w-3.5 h-3.5 text-gray-400" />
              </button>
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- Divider -->
    <div class="border-t border-neutral-800 my-8"></div>

    <!-- Custom Providers -->
    <div class="space-y-4">
      <h3 class="text-sm font-medium text-gray-300 uppercase tracking-wider">Custom Providers</h3>
      
      <!-- Existing custom providers -->
      <div v-if="customSecrets.length > 0" class="grid grid-cols-[1fr,400px,80px] gap-y-3 gap-x-4 items-center">
        <template v-for="secret in customSecrets" :key="secret.id">
          <!-- Provider Info Column -->
          <div>
            <label class="block text-sm font-medium text-gray-200">{{ secret.customName }}</label>
            <p class="text-xs text-gray-500 mt-0.5">Custom Provider</p>
          </div>
          
          <!-- Input/Display Column -->
          <div>
            <div v-if="editingCustomId !== secret.id">
              <span class="w-full inline-block text-center text-xs text-gray-500 bg-neutral-800 px-3 py-1.5 rounded-md border border-neutral-700">••••••••</span>
            </div>
            <div v-else class="relative">
              <input 
                :type="showKeyFor[secret.id] ? 'text' : 'password'"
                v-model="editingCustomKey"
                placeholder="Enter new API key"
                @keyup.enter="saveEditingCustom(secret.id)"
                @keyup.escape="cancelEditCustom"
                class="w-full pr-10 px-3 py-1.5 bg-neutral-800 border border-neutral-700/50 rounded-md text-white placeholder-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 hover:border-neutral-600 transition-all"
              />
              <button @click="toggleKeyVisibility(secret.id)"
                      type="button"
                      class="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-700 rounded transition-colors">
                <Eye v-if="!showKeyFor[secret.id]" class="w-3.5 h-3.5 text-gray-400" />
                <EyeOff v-else class="w-3.5 h-3.5 text-gray-400" />
              </button>
            </div>
          </div>
          
          <!-- Action Buttons Column -->
          <div class="flex justify-end">
            <div v-if="editingCustomId !== secret.id" class="flex gap-1">
              <button @click="startEditCustom(secret)"
                      class="p-1.5 hover:bg-neutral-800 rounded-md transition-colors"
                      title="Edit key">
                <Edit2 class="w-3.5 h-3.5 text-gray-400" />
              </button>
              <button @click="deleteSecret(secret.id)"
                      class="p-1.5 hover:bg-neutral-800 rounded-md transition-colors"
                      title="Delete key">
                <Trash2 class="w-3.5 h-3.5 text-red-400" />
              </button>
            </div>
            <div v-else class="flex gap-1">
              <button @click="saveEditingCustom(secret.id)"
                      :disabled="!editingCustomKey?.trim()"
                      class="p-1.5 hover:bg-neutral-800 rounded-md transition-colors"
                      title="Save">
                <Check class="w-3.5 h-3.5 text-green-400" />
              </button>
              <button @click="cancelEditCustom"
                      class="p-1.5 hover:bg-neutral-800 rounded-md transition-colors"
                      title="Cancel">
                <X class="w-3.5 h-3.5 text-gray-400" />
              </button>
            </div>
          </div>
        </template>
      </div>
      
      <!-- Add new custom provider form -->
      <div v-if="!showNewCustomForm" class="mt-2">
        <button @click="showNewCustomForm = true"
                class="px-3 py-1.5 text-sm text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800/50 transition-all flex items-center gap-1.5">
          <Plus class="w-3.5 h-3.5" />
          Add Custom Provider
        </button>
      </div>
      
      <div v-else class="grid grid-cols-[1fr,400px,80px] gap-y-3 gap-x-4 items-center mt-4">
        <!-- Provider Name Input Column -->
        <div>
          <input 
            v-model="newCustomProvider.name"
            type="text"
            placeholder="Provider name"
            @keyup.enter="saveNewCustomProvider"
            @keyup.escape="cancelNewCustom"
            class="w-full max-w-xs px-3 py-1.5 bg-neutral-800 border border-neutral-700/50 rounded-md text-white placeholder-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 hover:border-neutral-600 transition-all"
          />
        </div>
        
        <!-- API Key Input Column -->
        <div class="relative">
          <input 
            :type="showKeyFor.newCustom ? 'text' : 'password'"
            v-model="newCustomProvider.key"
            placeholder="Enter API key"
            @keyup.enter="saveNewCustomProvider"
            @keyup.escape="cancelNewCustom"
            class="w-full pr-10 px-3 py-1.5 bg-neutral-800 border border-neutral-700/50 rounded-md text-white placeholder-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 hover:border-neutral-600 transition-all"
          />
          <button @click="toggleKeyVisibility('newCustom')"
                  type="button"
                  class="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-700 rounded transition-colors">
            <Eye v-if="!showKeyFor.newCustom" class="w-3.5 h-3.5 text-gray-400" />
            <EyeOff v-else class="w-3.5 h-3.5 text-gray-400" />
          </button>
        </div>
        
        <!-- Action Buttons Column -->
        <div class="flex justify-end">
          <div class="flex gap-1">
            <button @click="saveNewCustomProvider"
                    :disabled="!newCustomProvider.name?.trim() || !newCustomProvider.key?.trim()"
                    class="p-1.5 hover:bg-neutral-800 rounded-md transition-colors"
                    title="Save">
              <Check class="w-3.5 h-3.5 text-green-400" />
            </button>
            <button @click="cancelNewCustom"
                    class="p-1.5 hover:bg-neutral-800 rounded-md transition-colors"
                    title="Cancel">
              <X class="w-3.5 h-3.5 text-gray-400" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive } from 'vue'
import { Edit2, Trash2, Eye, EyeOff, Plus, Check, X, ExternalLink } from 'lucide-vue-next'
import { useDebounce } from '@/core/composables/useDebounce'
import { API_KEY_URLS } from '@/core/constants'
import CliProviders from './CliProviders.vue'
import { openInAppBrowser } from '@/core/utils/openInAppBrowser'

interface Props {
  settings?: {
    google?: string | null
    anthropic?: string | null
    openai?: string | null
    groq?: string | null
    mistral?: string | null
    cohere?: string | null
    custom?: Record<string, string>
    cliPaths?: Record<string, string>
  }
}

interface SecretData {
  id: string
  provider: string
  customName?: string
  createdAt: number
  updatedAt?: number
}

const props = withDefaults(defineProps<Props>(), {
  settings: () => ({})
})

const emit = defineEmits<{
  'update-setting': [{
    path: string[]
    value: any
  }]
}>()

const standardProviders = [
  { key: 'anthropic', label: 'Anthropic', description: 'Claude 3, Claude 2', url: API_KEY_URLS.anthropic, priority: 'required', placeholder: 'Enter Anthropic API key' },
  { key: 'openai', label: 'OpenAI', description: 'GPT-4, GPT-3.5, DALL-E', url: API_KEY_URLS.openai, priority: 'required', placeholder: 'Enter OpenAI API key' },
  { key: 'google', label: 'Google AI', description: 'Gemini, PaLM', url: API_KEY_URLS.google, priority: 'recommended', placeholder: 'Enter Google AI API key' },
  { key: 'groq', label: 'Groq', description: 'Fast inference API', url: API_KEY_URLS.groq, placeholder: 'Enter Groq API key' },
  { key: 'mistral', label: 'Mistral AI', description: 'Mistral models', url: API_KEY_URLS.mistral, placeholder: 'Enter Mistral AI API key' },
  { key: 'cohere', label: 'Cohere', description: 'Command, Embed, Rerank', url: API_KEY_URLS.cohere, placeholder: 'Enter Cohere API key' },
]

// State for inline editing
const editingProviders = ref<Set<string>>(new Set())
const inlineKeyValues = ref<Record<string, string>>({})
const showKeyFor = ref<Record<string, boolean>>({})

// State for custom providers
const newCustomProvider = reactive({
  name: '',
  key: ''
})
const editingCustomId = ref<string | null>(null)
const editingCustomKey = ref('')
const showNewCustomForm = ref(false)

// Debounced save for standard providers
const { debounced: debouncedSaveStandard } = useDebounce((provider: string) => {
  if (inlineKeyValues.value[provider]?.trim()) {
    saveInlineKey(provider)
  }
}, 1000)

const customSecrets = computed(() => {
  const customApiKeys = props.settings?.custom || {};
  
  return Object.entries(customApiKeys).map(([customName, secretId]) => ({
    id: secretId as string,
    customName,
    provider: 'custom' as const,
    createdAt: 0,
    updatedAt: 0
  }));
})

const getSecretForProvider = (provider: string) => {
  const secretId = props.settings?.[provider as keyof typeof props.settings];
  if (secretId && typeof secretId === 'string') {
    return { id: secretId, provider };
  }
  return null;
}

const isEditing = (provider: string) => {
  return editingProviders.value.has(provider)
}

const startEdit = (provider: string) => {
  editingProviders.value.add(provider)
  inlineKeyValues.value[provider] = ''
}

const cancelEdit = (provider: string) => {
  editingProviders.value.delete(provider)
  inlineKeyValues.value[provider] = ''
  showKeyFor.value[provider] = false
}

const toggleKeyVisibility = (key: string) => {
  showKeyFor.value[key] = !showKeyFor.value[key]
}

const handleKeyInput = (provider: string) => {
  if (!isEditing(provider)) {
    // Auto-save for new keys
    debouncedSaveStandard(provider)
  }
}

const saveInlineKey = (provider: string) => {
  const keyValue = inlineKeyValues.value[provider]?.trim()
  if (!keyValue) return
  
  const existingSecret = getSecretForProvider(provider)
  
  emit('update-setting', {
    path: ['secrets_operation'],
    value: {
      type: existingSecret ? 'UPDATE_API_KEY' : 'CREATE_API_KEY',
      provider,
      value: keyValue,
      editingSecretId: existingSecret?.id
    }
  })
  
  // Clear the form
  cancelEdit(provider)
}

const deleteKey = (provider: string) => {
  const secret = getSecretForProvider(provider)
  if (secret && confirm(`Are you sure you want to delete this API key?`)) {
    deleteSecret(secret.id, false)
  }
}

const deleteSecret = (id: string, shouldConfirm: boolean = true) => {
  if (!shouldConfirm || confirm(`Are you sure you want to delete this API key?`)) {
    emit('update-setting', {
      path: ['secrets_operation'],
      value: {
        type: 'DELETE_API_KEY',
        id
      }
    })
  }
}

// Custom provider functions
const startEditCustom = (secret: SecretData) => {
  editingCustomId.value = secret.id
  editingCustomKey.value = ''
}

const cancelEditCustom = () => {
  editingCustomId.value = null
  editingCustomKey.value = ''
  showKeyFor.value = {}
}

const saveEditingCustom = (id: string) => {
  const keyValue = editingCustomKey.value?.trim()
  if (!keyValue) return
  
  emit('update-setting', {
    path: ['secrets_operation'],
    value: {
      type: 'UPDATE_API_KEY',
      editingSecretId: id,
      value: keyValue
    }
  })
  
  cancelEditCustom()
}

const saveNewCustomProvider = () => {
  const name = newCustomProvider.name?.trim()
  const key = newCustomProvider.key?.trim()
  
  if (!name || !key) return
  
  emit('update-setting', {
    path: ['secrets_operation'],
    value: {
      type: 'CREATE_API_KEY',
      provider: 'custom',
      customName: name,
      value: key
    }
  })
  
  // Clear the form
  newCustomProvider.name = ''
  newCustomProvider.key = ''
  showKeyFor.value.newCustom = false
  showNewCustomForm.value = false
}

const cancelNewCustom = () => {
  newCustomProvider.name = ''
  newCustomProvider.key = ''
  showKeyFor.value.newCustom = false
  showNewCustomForm.value = false
}

const openProviderUrl = (url: string) => {
  openInAppBrowser(url)
}
</script>