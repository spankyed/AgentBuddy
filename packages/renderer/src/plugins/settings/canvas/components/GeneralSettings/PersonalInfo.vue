<template>
  <div class="max-w-3xl">
    <!-- Header Section -->
    <div class="mb-8">
      <h2 class="text-xl font-semibold text-white mb-2">Personal Information</h2>
      <p class="text-sm text-neutral-500">
        Manage your personal details and contact information. This information gets stored locally on your device.
      </p>
    </div>

    <!-- Form Fields -->
    <div class="space-y-6">
      <!-- Name Field -->
      <div class="group">
        <label for="name" class="block text-xs font-medium text-neutral-400 uppercase tracking-wider mb-2">
          Name
        </label>
        <input
          id="name"
          v-model="formData.name"
          type="text"
          placeholder="Enter your name"
          @input="debouncedSave"
          class="w-full max-w-md px-3 py-2 bg-neutral-800 border border-neutral-700/50 rounded-lg text-white placeholder-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 hover:border-neutral-600 transition-all"
        />
        <p class="mt-1.5 text-xs text-neutral-600">
          As you'd like it to appear to the assistant
        </p>
      </div>

      <!-- Divider -->
      <div class="border-t border-neutral-800"></div>

      <!-- Phone Field -->
      <div class="group">
        <label for="phone" class="block text-xs font-medium text-neutral-400 uppercase tracking-wider mb-2">
          Phone Number
        </label>
        <input
          id="phone"
          v-model="formData.phoneNumber"
          type="tel"
          placeholder="Enter your phone number"
          @input="debouncedSave"
          class="w-full max-w-md px-3 py-2 bg-neutral-800 border border-neutral-700/50 rounded-lg text-white placeholder-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 hover:border-neutral-600 transition-all"
        />
        <p class="mt-1.5 text-xs text-neutral-600">
          Primary contact number for notifications
        </p>
      </div>

      <!-- Divider -->
      <div class="border-t border-neutral-800"></div>

      <!-- Address Field -->
      <div class="group">
        <AddressInput v-model="formData.address" @update:modelValue="debouncedSave" />
      </div>
    </div>

    <!-- Save status will be managed by parent -->
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useSelector } from '@xstate/vue'
import { applicationState } from '@/main'
import AddressInput from './AddressInput.vue'

const emit = defineEmits<{
  'update-setting': [{
    path: string[]
    value: any
  }]
}>()

const actor = applicationState.system.get('settings')
const settings = useSelector(actor, (state: any) => state.context.settings)

const formData = ref<{
  name: string
  phoneNumber: string
  address: any // Can be string (legacy) or structured object
}>({
  name: '',
  phoneNumber: '',
  address: {
    street: '',
    street2: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'US'
  },
})

let saveTimeout: NodeJS.Timeout | null = null

// Initialize form data from settings only once on mount
if (settings.value?.general?.personal) {
  const personalData = settings.value.general.personal
  formData.value = {
    name: personalData.name || '',
    phoneNumber: personalData.phoneNumber || '',
    address: personalData.address || {
      street: '',
      street2: '',
      city: '',
      state: '',
      postalCode: '',
      country: 'US'
    },
  }
}

// Debounced save function
const debouncedSave = () => {
  // Clear existing timeout
  if (saveTimeout) {
    clearTimeout(saveTimeout)
  }
  
  // Debounce the save
  saveTimeout = setTimeout(() => {
    emit('update-setting', {
      path: [],
      value: formData.value
    })
  }, 500)
}
</script>

