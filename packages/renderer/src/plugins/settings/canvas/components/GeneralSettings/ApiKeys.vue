<template>
  <div class="max-w-3xl">
    <!-- Header Section -->
    <div class="mb-8">
      <h2 class="text-xl font-semibold text-white mb-2">API Keys</h2>
      <p class="text-sm text-neutral-500">
        Configure your API keys used to authenticate with external services.. These keys are stored locally.
      </p>
    </div>
    
    <!-- Form Fields -->
    <div class="space-y-6">
      <!-- Google API Key -->
      <div class="group">
        <label for="google-key" class="block text-xs font-medium text-neutral-400 uppercase tracking-wider mb-2">
          Google API Key
        </label>
        <div class="flex gap-2 max-w-md">
          <input
            id="google-key"
            v-model="formData.google"
            :type="showKeys.google ? 'text' : 'password'"
            placeholder="Enter your Google API key"
            class="flex-1 px-4 py-2.5 bg-neutral-800 border border-neutral-700/50 rounded-lg text-white placeholder-neutral-600 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 hover:border-neutral-600 transition-all"
          />
          <button @click="toggleVisibility('google')" class="px-3 py-2.5 bg-neutral-800 border border-neutral-700/50 rounded-lg text-neutral-400 hover:text-neutral-200 hover:border-neutral-600 transition-all">
            <Eye v-if="showKeys.google" class="w-4 h-4" />
            <EyeOff v-else class="w-4 h-4" />
          </button>
        </div>
        <p class="mt-1.5 text-xs text-neutral-600">
          Used for Google AI services and APIs
        </p>
      </div>

      <!-- Divider -->
      <div class="border-t border-neutral-800"></div>

      <!-- Anthropic API Key -->
      <div class="group">
        <label for="anthropic-key" class="block text-xs font-medium text-neutral-400 uppercase tracking-wider mb-2">
          Anthropic API Key
        </label>
        <div class="flex gap-2 max-w-md">
          <input
            id="anthropic-key"
            v-model="formData.anthropic"
            :type="showKeys.anthropic ? 'text' : 'password'"
            placeholder="Enter your Anthropic API key"
            class="flex-1 px-4 py-2.5 bg-neutral-800 border border-neutral-700/50 rounded-lg text-white placeholder-neutral-600 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 hover:border-neutral-600 transition-all"
          />
          <button @click="toggleVisibility('anthropic')" class="px-3 py-2.5 bg-neutral-800 border border-neutral-700/50 rounded-lg text-neutral-400 hover:text-neutral-200 hover:border-neutral-600 transition-all">
            <Eye v-if="showKeys.anthropic" class="w-4 h-4" />
            <EyeOff v-else class="w-4 h-4" />
          </button>
        </div>
        <p class="mt-1.5 text-xs text-neutral-600">
          Used for Claude and other Anthropic models
        </p>
      </div>

      <!-- Divider -->
      <div class="border-t border-neutral-800"></div>

      <!-- OpenAI API Key -->
      <div class="group">
        <label for="openai-key" class="block text-xs font-medium text-neutral-400 uppercase tracking-wider mb-2">
          OpenAI API Key
        </label>
        <div class="flex gap-2 max-w-md">
          <input
            id="openai-key"
            v-model="formData.openai"
            :type="showKeys.openai ? 'text' : 'password'"
            placeholder="Enter your OpenAI API key"
            class="flex-1 px-4 py-2.5 bg-neutral-800 border border-neutral-700/50 rounded-lg text-white placeholder-neutral-600 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 hover:border-neutral-600 transition-all"
          />
          <button @click="toggleVisibility('openai')" class="px-3 py-2.5 bg-neutral-800 border border-neutral-700/50 rounded-lg text-neutral-400 hover:text-neutral-200 hover:border-neutral-600 transition-all">
            <Eye v-if="showKeys.openai" class="w-4 h-4" />
            <EyeOff v-else class="w-4 h-4" />
          </button>
        </div>
        <p class="mt-1.5 text-xs text-neutral-600">
          Used for GPT models and OpenAI services
        </p>
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


