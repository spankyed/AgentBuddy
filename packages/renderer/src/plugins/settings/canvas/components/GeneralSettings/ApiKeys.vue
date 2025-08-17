<template>
  <div class="api-keys">
    <h2>API Keys</h2>
    <p class="description">
      Configure your API keys for various AI providers. These keys are stored locally and used to authenticate with external services.
    </p>
    
    <div class="form-group">
      <label for="google-key">
        Google API Key
      </label>
      <div class="input-group">
        <input
          id="google-key"
          v-model="formData.google"
          :type="showKeys.google ? 'text' : 'password'"
          placeholder="Enter your Google API key"
        />
        <button @click="toggleVisibility('google')" class="toggle-visibility">
          <Eye v-if="showKeys.google" />
          <EyeOff v-else />
        </button>
      </div>
    </div>

    <div class="form-group">
      <label for="anthropic-key">
        Anthropic API Key
      </label>
      <div class="input-group">
        <input
          id="anthropic-key"
          v-model="formData.anthropic"
          :type="showKeys.anthropic ? 'text' : 'password'"
          placeholder="Enter your Anthropic API key"
        />
        <button @click="toggleVisibility('anthropic')" class="toggle-visibility">
          <Eye v-if="showKeys.anthropic" />
          <EyeOff v-else />
        </button>
      </div>
    </div>

    <div class="form-group">
      <label for="openai-key">
        OpenAI API Key
      </label>
      <div class="input-group">
        <input
          id="openai-key"
          v-model="formData.openai"
          :type="showKeys.openai ? 'text' : 'password'"
          placeholder="Enter your OpenAI API key"
        />
        <button @click="toggleVisibility('openai')" class="toggle-visibility">
          <Eye v-if="showKeys.openai" />
          <EyeOff v-else />
        </button>
      </div>
    </div>

    <button @click="save" class="save-button">Save API Keys</button>
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

<style scoped>
.api-keys {
  max-width: 600px;
}

h2 {
  margin-bottom: 1rem;
  color: var(--color-heading);
}

.description {
  margin-bottom: 2rem;
  color: var(--color-text-secondary);
  font-size: 14px;
  line-height: 1.5;
}

.form-group {
  margin-bottom: 1.5rem;
}

label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: var(--color-text);
}

.input-group {
  display: flex;
  gap: 0.5rem;
}

input {
  flex: 1;
  padding: 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-background-soft);
  color: var(--color-text);
  font-size: 14px;
  transition: border-color 0.2s;
}

input:focus {
  outline: none;
  border-color: var(--color-primary);
}

.toggle-visibility {
  padding: 0.75rem;
  background: var(--color-background-soft);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.toggle-visibility:hover {
  background: var(--color-background-mute);
}

.save-button {
  padding: 0.75rem 1.5rem;
  background: var(--color-primary);
  color: white;
  border: none;
  border-radius: 4px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.save-button:hover {
  background: var(--color-primary-dark);
}
</style>