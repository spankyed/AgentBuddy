<template>
  <div class="max-w-md">
    <h2 class="text-xl font-semibold text-white mb-6">Personal Information</h2>
    <div class="space-y-4">
      <div>
        <label for="name" class="block text-xs font-medium text-neutral-400 uppercase tracking-wider mb-2">Name</label>
        <input
          id="name"
          v-model="formData.name"
          type="text"
          placeholder="Enter your name"
          class="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-md text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>
      <div>
        <label for="phone" class="block text-xs font-medium text-neutral-400 uppercase tracking-wider mb-2">Phone Number</label>
        <input
          id="phone"
          v-model="formData.phoneNumber"
          type="tel"
          placeholder="Enter your phone number"
          class="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-md text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>
      <div>
        <label for="address" class="block text-xs font-medium text-neutral-400 uppercase tracking-wider mb-2">Address</label>
        <textarea
          id="address"
          v-model="formData.address"
          placeholder="Enter your address"
          rows="3"
          class="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-md text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
        />
      </div>
    </div>
    <button @click="save" class="mt-6 px-4 py-2 bg-blue-500 text-white rounded-md font-medium hover:bg-blue-600 transition-colors">Save Changes</button>
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

