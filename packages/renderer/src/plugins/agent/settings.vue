<template>
  <div class="agent-settings">
    <div class="setting-group">
      <h3>Model Configuration</h3>
      <div class="form-group">
        <label for="model">Default Model</label>
        <select id="model" v-model="settings.model">
          <option value="gpt-4">GPT-4</option>
          <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
          <option value="claude-3">Claude 3</option>
          <option value="claude-2">Claude 2</option>
        </select>
      </div>
      
      <div class="form-group">
        <label for="temperature">Temperature</label>
        <input
          id="temperature"
          type="range"
          min="0"
          max="2"
          step="0.1"
          v-model.number="settings.temperature"
        />
        <span class="value">{{ settings.temperature }}</span>
      </div>

      <div class="form-group">
        <label for="max-tokens">Max Tokens</label>
        <input
          id="max-tokens"
          type="number"
          min="100"
          max="4000"
          step="100"
          v-model.number="settings.maxTokens"
        />
      </div>
    </div>

    <div class="setting-group">
      <h3>Display Options</h3>
      <div class="form-group checkbox-group">
        <label>
          <input type="checkbox" v-model="settings.showTokenCount" />
          Show token count
        </label>
      </div>
      
      <div class="form-group checkbox-group">
        <label>
          <input type="checkbox" v-model="settings.streamResponses" />
          Stream responses
        </label>
      </div>

      <div class="form-group checkbox-group">
        <label>
          <input type="checkbox" v-model="settings.autoSave" />
          Auto-save conversations
        </label>
      </div>
    </div>

    <button @click="saveSettings" class="save-button">Save Agent Settings</button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { applicationState } from '@/main'

const settingsActor = applicationState.system.get('settings')

const settings = ref({
  model: 'gpt-4',
  temperature: 0.7,
  maxTokens: 2000,
  showTokenCount: true,
  streamResponses: true,
  autoSave: true,
})

const saveSettings = () => {
  settingsActor.send({
    type: 'PLUGIN_SETTINGS.UPDATE',
    pluginId: 'agent',
    settings: settings.value
  })
}
</script>

<style scoped>
.agent-settings {
  max-width: 600px;
}

.setting-group {
  margin-bottom: 2rem;
  padding-bottom: 2rem;
  border-bottom: 1px solid var(--color-border);
}

.setting-group:last-of-type {
  border-bottom: none;
}

h3 {
  margin-bottom: 1rem;
  color: var(--color-heading);
  font-size: 18px;
}

.form-group {
  margin-bottom: 1rem;
}

label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: var(--color-text);
  font-size: 14px;
}

select,
input[type="number"] {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-background-soft);
  color: var(--color-text);
  font-size: 14px;
}

input[type="range"] {
  width: calc(100% - 60px);
  margin-right: 10px;
}

.value {
  display: inline-block;
  width: 40px;
  text-align: right;
  color: var(--color-text-secondary);
  font-size: 14px;
}

.checkbox-group label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
}

.checkbox-group input[type="checkbox"] {
  cursor: pointer;
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