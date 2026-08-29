<template>
  <div class="space-y-4">
    <!-- Street Address Row -->
    <div>
      <label for="street" class="block text-xs font-medium text-neutral-400 mb-2.5">
        Street Address
      </label>
      <input
        id="street"
        v-model="localAddress.street"
        type="text"
        placeholder="123 Main Street"
        class="w-full max-w-lg px-4 py-2.5 bg-neutral-800/50 border border-neutral-700/50 rounded-lg text-white placeholder-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 hover:border-neutral-600 transition-all"
      />
    </div>

    <!-- Apartment/Suite Row (Optional) -->
    <div>
      <label for="street2" class="block text-xs font-medium text-neutral-400 mb-2.5">
        Apartment / Suite
        <span class="text-neutral-600 ml-1 normal-case">(optional)</span>
      </label>
      <input
        id="street2"
        v-model="localAddress.street2"
        type="text"
        placeholder="Apt 4B, Suite 200, etc."
        class="w-full max-w-sm px-4 py-2.5 bg-neutral-800/50 border border-neutral-700/50 rounded-lg text-white placeholder-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 hover:border-neutral-600 transition-all"
      />
    </div>

    <!-- City, State, ZIP Row -->
    <div class="grid grid-cols-1 sm:grid-cols-[2fr,120px,140px] gap-4 max-w-lg">
      <!-- City -->
      <div>
        <label for="city" class="block text-xs font-medium text-neutral-400 mb-2.5">
          City
        </label>
        <input
          id="city"
          v-model="localAddress.city"
          type="text"
          placeholder="New York"
          class="w-full px-4 py-2.5 bg-neutral-800/50 border border-neutral-700/50 rounded-lg text-white placeholder-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 hover:border-neutral-600 transition-all"
        />
      </div>

      <!-- State -->
      <div>
        <label for="state" class="block text-xs font-medium text-neutral-400 mb-2.5">
          State
        </label>
        <select
          id="state"
          v-model="localAddress.state"
          class="w-full px-3 py-2.5 bg-neutral-800/50 border border-neutral-700/50 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 hover:border-neutral-600 transition-all appearance-none cursor-pointer"
        >
          <option value="" disabled>Select</option>
          <option v-for="state in usStates" :key="state.value" :value="state.value">
            {{ state.label }}
          </option>
        </select>
      </div>

      <!-- ZIP Code -->
      <div>
        <label for="postalCode" class="block text-xs font-medium text-neutral-400 mb-2.5">
          ZIP Code
        </label>
        <input
          id="postalCode"
          v-model="localAddress.postalCode"
          type="text"
          placeholder="12345"
          maxlength="10"
          class="w-full px-4 py-2.5 bg-neutral-800/50 border border-neutral-700/50 rounded-lg text-white placeholder-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 hover:border-neutral-600 transition-all"
          @input="handleZipInput"
        />
      </div>
    </div>

    <!-- Country Row -->
    <div>
      <label for="country" class="block text-xs font-medium text-neutral-400 mb-2.5">
        Country
      </label>
      <select
        id="country"
        v-model="localAddress.country"
        class="w-full max-w-xs px-4 py-2.5 bg-neutral-800/50 border border-neutral-700/50 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 hover:border-neutral-600 transition-all appearance-none cursor-pointer"
      >
        <option value="US">United States</option>
        <option value="CA">Canada</option>
        <option value="MX">Mexico</option>
        <option value="GB">United Kingdom</option>
        <option value="AU">Australia</option>
        <option value="DE">Germany</option>
        <option value="FR">France</option>
        <option value="JP">Japan</option>
        <option value="CN">China</option>
        <option value="IN">India</option>
        <option value="BR">Brazil</option>
        <option value="other">Other</option>
      </select>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, reactive } from 'vue'

interface Address {
  street: string
  street2?: string
  city: string
  state: string
  postalCode: string
  country: string
}

interface Props {
  modelValue: Address | string
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:modelValue': [value: Address]
}>()

// US States data
const usStates = [
  { value: 'AL', label: 'AL' },
  { value: 'AK', label: 'AK' },
  { value: 'AZ', label: 'AZ' },
  { value: 'AR', label: 'AR' },
  { value: 'CA', label: 'CA' },
  { value: 'CO', label: 'CO' },
  { value: 'CT', label: 'CT' },
  { value: 'DE', label: 'DE' },
  { value: 'FL', label: 'FL' },
  { value: 'GA', label: 'GA' },
  { value: 'HI', label: 'HI' },
  { value: 'ID', label: 'ID' },
  { value: 'IL', label: 'IL' },
  { value: 'IN', label: 'IN' },
  { value: 'IA', label: 'IA' },
  { value: 'KS', label: 'KS' },
  { value: 'KY', label: 'KY' },
  { value: 'LA', label: 'LA' },
  { value: 'ME', label: 'ME' },
  { value: 'MD', label: 'MD' },
  { value: 'MA', label: 'MA' },
  { value: 'MI', label: 'MI' },
  { value: 'MN', label: 'MN' },
  { value: 'MS', label: 'MS' },
  { value: 'MO', label: 'MO' },
  { value: 'MT', label: 'MT' },
  { value: 'NE', label: 'NE' },
  { value: 'NV', label: 'NV' },
  { value: 'NH', label: 'NH' },
  { value: 'NJ', label: 'NJ' },
  { value: 'NM', label: 'NM' },
  { value: 'NY', label: 'NY' },
  { value: 'NC', label: 'NC' },
  { value: 'ND', label: 'ND' },
  { value: 'OH', label: 'OH' },
  { value: 'OK', label: 'OK' },
  { value: 'OR', label: 'OR' },
  { value: 'PA', label: 'PA' },
  { value: 'RI', label: 'RI' },
  { value: 'SC', label: 'SC' },
  { value: 'SD', label: 'SD' },
  { value: 'TN', label: 'TN' },
  { value: 'TX', label: 'TX' },
  { value: 'UT', label: 'UT' },
  { value: 'VT', label: 'VT' },
  { value: 'VA', label: 'VA' },
  { value: 'WA', label: 'WA' },
  { value: 'WV', label: 'WV' },
  { value: 'WI', label: 'WI' },
  { value: 'WY', label: 'WY' },
  { value: 'DC', label: 'DC' }
]

// Parse incoming address (handle both string and object formats)
const parseAddress = (value: Address | string): Address => {
  if (typeof value === 'string') {
    // Try to parse legacy string format
    const lines = value.split('\n').filter(line => line.trim())
    return {
      street: lines[0] || '',
      street2: lines.length > 3 ? lines[1] : '',
      city: '',
      state: '',
      postalCode: '',
      country: 'US'
    }
  }
  return {
    street: value.street || '',
    street2: value.street2 || '',
    city: value.city || '',
    state: value.state || '',
    postalCode: value.postalCode || '',
    country: value.country || 'US'
  }
}

// Local address data
const localAddress = reactive<Address>(parseAddress(props.modelValue))

// Handle ZIP code input with auto-formatting
const handleZipInput = (event: Event) => {
  const input = event.target as HTMLInputElement
  let value = input.value.replace(/\D/g, '') // Remove non-digits
  
  // Format as XXXXX-XXXX for US ZIP+4
  if (value.length > 5) {
    value = value.slice(0, 5) + '-' + value.slice(5, 9)
  }
  
  localAddress.postalCode = value
  input.value = value
}

// Watch for changes and emit updates
watch(localAddress, (newAddress) => {
  emit('update:modelValue', newAddress)
}, { deep: true })

// Watch for external changes to modelValue
watch(() => props.modelValue, (newValue) => {
  const parsed = parseAddress(newValue)
  Object.assign(localAddress, parsed)
}, { deep: true })
</script>

<style scoped>
/* Custom select arrow with better styling */
select {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b7280' d='M6 9L1 4h10z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 0.75rem center;
  padding-right: 2.5rem;
}

select:hover {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%239ca3af' d='M6 9L1 4h10z'/%3E%3C/svg%3E");
}

select:focus {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%233b82f6' d='M6 9L1 4h10z'/%3E%3C/svg%3E");
}
</style>