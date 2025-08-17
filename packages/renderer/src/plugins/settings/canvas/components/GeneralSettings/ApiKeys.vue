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

    <button @click="save" class="mt-6 px-4 py-2 bg-blue-500 text-white rounded-md font-medium hover:bg-blue-600 transition-colors">Save API Keys</button>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useSelector } from '@xstate/vue'
import { applicationState } from '@/main'
import { Eye, EyeOff } from 'lucide-vue-next'

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

const save = () => {
  actor.send({ 
    type: 'API_KEYS.UPDATE', 
    data: formData.value 
  })
}
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

.save-button {
  padding: 0.625rem 1.25rem;
  background: #007AFF;
  color: white;
  border: none;
  border-radius: 6px;
  font-weight: 500;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.save-button:hover {
  background: #0051D5;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 122, 255, 0.3);
}

.save-button:active {
  transform: translateY(0);
}
