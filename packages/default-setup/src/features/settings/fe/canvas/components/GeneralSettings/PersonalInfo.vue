<template>
  <div class="max-w-4xl">
    <!-- Header Section -->
    <div class="mb-8">
      <h2 class="text-xl font-semibold text-white mb-2">Personal Information</h2>
      <p class="text-sm text-neutral-500">
        Manage your personal details and contact information. This information is only stored locally on your device, to be used in AI workflows.
      </p>
    </div>

    <!-- Personal Details Card -->
    <div class="bg-neutral-900/50 border border-neutral-800 rounded-xl p-6 mb-6">
      <div class="flex items-center gap-2 mb-6">
        <User class="w-4 h-4 text-neutral-400" />
        <h3 class="text-sm font-medium text-neutral-300 uppercase tracking-wider">Personal Details</h3>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <!-- Name Field -->
        <div class="group">
          <label for="name" class="block text-xs font-medium text-neutral-400 mb-2.5">
            Full Name
          </label>
          <div class="relative">
            <input
              id="name"
              v-model="formData.name"
              type="text"
              placeholder="John Doe"
              @input="handleNameInput"
              class="w-full px-4 py-2.5 bg-neutral-800/50 border border-neutral-700/50 rounded-lg text-white placeholder-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 hover:border-neutral-600 transition-all"
            />
          </div>
          <p class="mt-1.5 text-xs text-neutral-600">
            How you'd like to be addressed
          </p>
        </div>

        <!-- Phone Field -->
        <div class="group">
          <label for="phone" class="block text-xs font-medium text-neutral-400 mb-2.5">
            Phone Number
          </label>
          <div class="relative">
            <input
              id="phone"
              v-model="formData.phoneNumber"
              type="tel"
              placeholder="(555) 123-4567"
              @input="handlePhoneInput"
              maxlength="14"
              class="w-full px-4 py-2.5 bg-neutral-800/50 border border-neutral-700/50 rounded-lg text-white placeholder-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 hover:border-neutral-600 transition-all"
            />
          </div>
          <p class="mt-1.5 text-xs text-neutral-600">
            For important notifications
          </p>
        </div>
      </div>
    </div>

    <!-- Address Card -->
    <div class="bg-neutral-900/50 border border-neutral-800 rounded-xl p-6">
      <div class="flex items-center gap-2 mb-6">
        <MapPin class="w-4 h-4 text-neutral-400" />
        <h3 class="text-sm font-medium text-neutral-300 uppercase tracking-wider">Address Information</h3>
      </div>

      <AddressInput v-model="formData.address" @update:modelValue="debouncedSave" />
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useDebounce } from '@/core/composables/useDebounce'
import { User, MapPin } from 'lucide-vue-next'
import AddressInput from './AddressInput.vue'

interface Props {
  settings?: any
}

const props = withDefaults(defineProps<Props>(), {
  settings: null
})

const emit = defineEmits<{
  'update-setting': [{
    path: string[]
    value: any
  }]
}>()

const formData = ref<{
  name: string
  phoneNumber: string
  address: any // Can be string (legacy) or structured object
}>({
  name: props.settings?.name || '',
  phoneNumber: props.settings?.phoneNumber || '',
  address: props.settings?.address || {
    street: '',
    street2: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'US'
  },
})

// Format phone number as user types
const formatPhoneNumber = (value: string) => {
  // Remove all non-digits
  const cleaned = value.replace(/\D/g, '')

  // Format as (XXX) XXX-XXXX
  const match = cleaned.match(/^(\d{0,3})(\d{0,3})(\d{0,4})$/)
  if (!match) return value

  if (match[1] && !match[2]) {
    return match[1]
  } else if (match[2] && !match[3]) {
    return `(${match[1]}) ${match[2]}`
  } else if (match[3]) {
    return `(${match[1]}) ${match[2]}-${match[3]}`
  }
  return value
}

// Handle phone input with formatting
const handlePhoneInput = (event: Event) => {
  const input = event.target as HTMLInputElement
  const formatted = formatPhoneNumber(input.value)
  formData.value.phoneNumber = formatted
  input.value = formatted
  debouncedSave()
}

// Handle name input
const handleNameInput = () => {
  debouncedSave()
}

// Use the debounce composable
const { debounced: debouncedSave } = useDebounce(() => {
  emit('update-setting', {
    path: [],
    value: formData.value
  })
}, 500)
</script>

