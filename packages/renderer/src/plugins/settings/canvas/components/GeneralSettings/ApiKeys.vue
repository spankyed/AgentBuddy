<template>
  <div class="max-w-md">
    <h2 class="text-xl font-semibold text-white mb-2">API Keys</h2>
    <p class="text-sm text-neutral-400 mb-6">
      Configure your API keys for various AI providers. These keys are stored locally and used to authenticate with external services.
    </p>
    
    <div class="space-y-4">
      <div>
        <label for="google-key" class="block text-xs font-medium text-neutral-400 uppercase tracking-wider mb-2">
          Google API Key
        </label>
        <div class="flex gap-2">
          <input
            id="google-key"
            v-model="formData.google"
            :type="showKeys.google ? 'text' : 'password'"
            placeholder="Enter your Google API key"
            class="flex-1 px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-md text-white placeholder-neutral-500 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button @click="toggleVisibility('google')" class="px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-md text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700 transition-colors">
            <Eye v-if="showKeys.google" class="w-4 h-4" />
            <EyeOff v-else class="w-4 h-4" />
          </button>
        </div>
      </div>

      <div>
        <label for="anthropic-key" class="block text-xs font-medium text-neutral-400 uppercase tracking-wider mb-2">
          Anthropic API Key
        </label>
        <div class="flex gap-2">
          <input
            id="anthropic-key"
            v-model="formData.anthropic"
            :type="showKeys.anthropic ? 'text' : 'password'"
            placeholder="Enter your Anthropic API key"
            class="flex-1 px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-md text-white placeholder-neutral-500 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button @click="toggleVisibility('anthropic')" class="px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-md text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700 transition-colors">
            <Eye v-if="showKeys.anthropic" class="w-4 h-4" />
            <EyeOff v-else class="w-4 h-4" />
          </button>
        </div>
      </div>

      <div>
        <label for="openai-key" class="block text-xs font-medium text-neutral-400 uppercase tracking-wider mb-2">
          OpenAI API Key
        </label>
        <div class="flex gap-2">
          <input
            id="openai-key"
            v-model="formData.openai"
            :type="showKeys.openai ? 'text' : 'password'"
            placeholder="Enter your OpenAI API key"
            class="flex-1 px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-md text-white placeholder-neutral-500 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button @click="toggleVisibility('openai')" class="px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-md text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700 transition-colors">
            <Eye v-if="showKeys.openai" class="w-4 h-4" />
            <EyeOff v-else class="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>

    <!-- Autosave indicator -->
    <div class="mt-6 flex items-center gap-2">
      <div v-if="saveStatus === 'saving'" class="flex items-center gap-2 text-xs text-neutral-500">
        <div class="w-1 h-1 bg-neutral-500 rounded-full animate-pulse"></div>
        Saving...
      </div>
      <div v-else-if="saveStatus === 'saved'" class="flex items-center gap-2 text-xs text-green-600">
        <CheckCircle class="w-3 h-3" />
        API keys updated
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useSelector } from '@xstate/vue'
import { applicationState } from '@/main'
import { Eye, EyeOff, CheckCircle } from 'lucide-vue-next'

const actor = applicationState.system.get('settings')

const settings = useSelector(actor, (state: any) => state.context.settings)

const formData = ref({
  google: '',
  anthropic: '',
  openai: '',
})

const showKeys = ref({
  google: false,
  anthropic: false,
  openai: false,
})

const saveStatus = ref<'idle' | 'saving' | 'saved'>('idle')
let saveTimeout: NodeJS.Timeout | null = null
let statusTimeout: NodeJS.Timeout | null = null

// Initialize form data from settings
watch(settings, (newSettings) => {
  if (newSettings?.general?.apiKeys) {
    formData.value = {
      google: newSettings.general.apiKeys.google || '',
      anthropic: newSettings.general.apiKeys.anthropic || '',
      openai: newSettings.general.apiKeys.openai || '',
    }
  }
}, { immediate: true })

const toggleVisibility = (provider: 'google' | 'anthropic' | 'openai') => {
  showKeys.value[provider] = !showKeys.value[provider]
}

// Autosave with debouncing
watch(formData, (newData) => {
  // Clear existing timeout
  if (saveTimeout) {
    clearTimeout(saveTimeout)
  }
  if (statusTimeout) {
    clearTimeout(statusTimeout)
  }
  
  // Show saving status
  saveStatus.value = 'saving'
  
  // Debounce the save
  saveTimeout = setTimeout(() => {
    actor.send({ 
      type: 'API_KEYS.UPDATE', 
      data: newData 
    })
    
    // Show saved status
    saveStatus.value = 'saved'
    
    // Hide status after 2 seconds
    statusTimeout = setTimeout(() => {
      saveStatus.value = 'idle'
    }, 2000)
  }, 500)
}, { deep: true })
</script>

.api-keys {
  max-width: 500px;
}

h2 {
  margin: 0 0 1rem 0;
  color: white;
  font-size: 20px;
  font-weight: 600;
}

.description {
  margin-bottom: 2rem;
  color: rgba(255, 255, 255, 0.5);
  font-size: 13px;
  line-height: 1.6;
}

.form-group {
  margin-bottom: 1.75rem;
}

label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.7);
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.input-group {
  display: flex;
  gap: 0.5rem;
}

input {
  flex: 1;
  padding: 0.625rem 0.875rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.03);
  color: white;
  font-size: 14px;
  font-family: 'SF Mono', Monaco, monospace;
  transition: all 0.2s;
}

input::placeholder {
  color: rgba(255, 255, 255, 0.25);
}

input:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.15);
}

input:focus {
  outline: none;
  border-color: #007AFF;
  background: rgba(255, 255, 255, 0.05);
  box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.1);
}

.toggle-visibility {
  padding: 0.625rem;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  color: rgba(255, 255, 255, 0.5);
}

.toggle-visibility:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.7);
}

