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
          placeholder="Enter your name as it should appear in the app"
          class="w-full max-w-md px-4 py-2.5 bg-neutral-900/50 border border-neutral-700/50 rounded-lg text-white placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 hover:border-neutral-600 transition-all"
        />
        <p class="mt-1.5 text-xs text-neutral-600">
          Your name as you'd like it to appear in the application
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
          class="w-full max-w-md px-4 py-2.5 bg-neutral-900/50 border border-neutral-700/50 rounded-lg text-white placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 hover:border-neutral-600 transition-all"
        />
        <p class="mt-1.5 text-xs text-neutral-600">
          Your primary contact number for notifications
        </p>
      </div>

      <!-- Divider -->
      <div class="border-t border-neutral-800"></div>

      <!-- Address Field -->
      <div class="group">
        <label for="address" class="block text-xs font-medium text-neutral-400 uppercase tracking-wider mb-2">
          Address
        </label>
        <textarea
          id="address"
          v-model="formData.address"
          placeholder="Enter your address"
          rows="4"
          class="w-full max-w-md px-4 py-2.5 bg-neutral-900/50 border border-neutral-700/50 rounded-lg text-white placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 hover:border-neutral-600 transition-all resize-none"
        />
        <p class="mt-1.5 text-xs text-neutral-600">
          Your complete mailing address
        </p>
      </div>
    </div>

    <!-- Footer with Save Button -->
    <div class="mt-8 pt-6 border-t border-neutral-800">
      <div class="flex items-center justify-between">
        <p class="text-xs text-neutral-600">
          Changes are saved locally on this device
        </p>
        <button 
          @click="save" 
          class="px-5 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all text-sm"
        >
          Save Changes
        </button>
      </div>
    </div>
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

