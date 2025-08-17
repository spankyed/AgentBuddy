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

    <!-- Autosave indicator -->
    <div class="mt-6 flex items-center gap-2">
      <div v-if="saveStatus === 'saving'" class="flex items-center gap-2 text-xs text-neutral-500">
        <div class="w-1 h-1 bg-neutral-500 rounded-full animate-pulse"></div>
        Saving...
      </div>
      <div v-else-if="saveStatus === 'saved'" class="flex items-center gap-2 text-xs text-green-600">
        <CheckCircle class="w-3 h-3" />
        All changes saved
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useSelector } from '@xstate/vue'
import { applicationState } from '@/main'
import { CheckCircle } from 'lucide-vue-next'

const actor = applicationState.system.get('settings')

const settings = useSelector(actor, (state: any) => state.context.settings)

const formData = ref({
  name: '',
  phoneNumber: '',
  address: '',
})

const saveStatus = ref<'idle' | 'saving' | 'saved'>('idle')
let saveTimeout: NodeJS.Timeout | null = null
let statusTimeout: NodeJS.Timeout | null = null

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
      type: 'PERSONAL.UPDATE', 
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

