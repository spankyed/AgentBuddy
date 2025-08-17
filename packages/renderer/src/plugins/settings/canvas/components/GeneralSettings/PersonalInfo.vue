<template>
  <div class="personal-info">
    <h2>Personal Information</h2>
    <div class="form-group">
      <label for="name">Name</label>
      <input
        id="name"
        v-model="formData.name"
        type="text"
        placeholder="Enter your name"
      />
    </div>
    <div class="form-group">
      <label for="phone">Phone Number</label>
      <input
        id="phone"
        v-model="formData.phoneNumber"
        type="tel"
        placeholder="Enter your phone number"
      />
    </div>
    <div class="form-group">
      <label for="address">Address</label>
      <textarea
        id="address"
        v-model="formData.address"
        placeholder="Enter your address"
        rows="3"
      />
    </div>
    <button @click="save" class="save-button">Save Changes</button>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useSelector } from '@xstate/vue'
import { applicationState } from '@/main'

const actor = applicationState.system.get('settings')

const settings = useSelector(actor, (state: any) => state.context.settings)

const formData = ref({
  name: '',
  phoneNumber: '',
  address: '',
})

// Initialize form data from settings
watch(settings, (newSettings) => {
  if (newSettings?.general?.personal) {
    formData.value = {
      name: newSettings.general.personal.name || '',
      phoneNumber: newSettings.general.personal.phoneNumber || '',
      address: newSettings.general.personal.address || '',
    }
  }
}, { immediate: true })

const save = () => {
  actor.send({ 
    type: 'PERSONAL.UPDATE', 
    data: formData.value 
  })
}
</script>

<style scoped>
.personal-info {
  max-width: 600px;
}

h2 {
  margin-bottom: 1.5rem;
  color: var(--color-heading);
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

input,
textarea {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-background-soft);
  color: var(--color-text);
  font-size: 14px;
  transition: border-color 0.2s;
}

input:focus,
textarea:focus {
  outline: none;
  border-color: var(--color-primary);
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