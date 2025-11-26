<template>
  <div class="approval-buttons space-y-3">
    <!-- Response Display (when disabled/responded) -->
    <div v-if="disabled && response" class="space-y-2">
      <div
        class="flex items-center gap-2 px-3 py-2 rounded-lg border"
        :class="approvalClasses"
      >
        <component :is="approvalIcon" class="w-5 h-5 flex-shrink-0" />
        <span class="text-sm font-medium">{{ approvalText }}</span>
      </div>
      <div
        v-if="reasonText"
        class="px-3 py-2 bg-neutral-700/30 rounded-lg border border-neutral-600/50 text-sm text-neutral-300"
      >
        <div class="text-xs text-neutral-400 mb-1">Reason:</div>
        {{ reasonText }}
      </div>
    </div>

    <!-- Input Controls (when not disabled/not responded) -->
    <template v-else>
      <!-- Reason Input (if required or allowed) -->
    <div v-if="requireReason || allowReason" class="space-y-2">
      <label class="text-xs text-neutral-400">
        Reason {{ requireReason ? '(required)' : '(optional)' }}:
      </label>
      <textarea
        v-model="reason"
        :placeholder="reasonPlaceholder"
        :rows="reasonRows"
        :disabled="disabled"
        :class="[
          'w-full px-3 py-2 border rounded-lg text-sm placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-transparent resize-y',
          disabled
            ? 'bg-neutral-700/50 border-neutral-700 text-neutral-500 cursor-not-allowed'
            : 'bg-neutral-700 border-neutral-600 text-neutral-200'
        ]"
      ></textarea>
    </div>

    <!-- Approval Action Buttons -->
    <div class="flex items-center gap-2">
      <button
        @click="handleApprove"
        :disabled="isDisabled"
        :class="[
          'px-4 py-2 rounded-lg transition-colors text-sm font-medium flex items-center gap-2',
          isDisabled
            ? 'bg-neutral-700 text-neutral-500 cursor-not-allowed'
            : 'bg-green-600 hover:bg-green-500 text-white'
        ]"
      >
        <CheckCircle class="w-4 h-4" />
        {{ approveLabel }}
      </button>

        <button
          @click="handleDeny"
          :disabled="isDisabled"
          :class="[
            'px-4 py-2 rounded-lg transition-colors text-sm font-medium flex items-center gap-2',
            isDisabled
              ? 'bg-neutral-700 text-neutral-500 cursor-not-allowed'
              : 'bg-red-600 hover:bg-red-500 text-white'
          ]"
        >
          <XCircle class="w-4 h-4" />
          {{ denyLabel }}
        </button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { CheckCircle, XCircle } from 'lucide-vue-next'

interface Props {
  requireReason?: boolean
  allowReason?: boolean
  reasonPlaceholder?: string
  reasonRows?: number
  approveLabel?: string
  denyLabel?: string
  modelValue?: string  // For reason text
  disabled?: boolean
  response?: any
}

interface Emits {
  (e: 'update:modelValue', value: string): void
  (e: 'approve', reason?: string): void
  (e: 'deny', reason?: string): void
}

const props = withDefaults(defineProps<Props>(), {
  requireReason: false,
  allowReason: true,
  reasonPlaceholder: 'Enter your reason...',
  reasonRows: 3,
  approveLabel: 'Approve',
  denyLabel: 'Deny',
  modelValue: '',
  disabled: false
})

const emit = defineEmits<Emits>()

const reason = ref(props.modelValue)

// Response display handling
const approvalClasses = computed(() => {
  const approved = props.response?.approved ?? props.response === true
  return approved
    ? 'bg-green-900/20 border-green-600/30 text-green-200'
    : 'bg-red-900/20 border-red-600/30 text-red-200'
})

const approvalIcon = computed(() => {
  const approved = props.response?.approved ?? props.response === true
  return approved ? CheckCircle : XCircle
})

const approvalText = computed(() => {
  const approved = props.response?.approved ?? props.response === true
  return approved ? 'Approved' : 'Denied'
})

const reasonText = computed(() => {
  return props.response?.reason || ''
})

const isDisabled = computed(() => {
  return props.disabled || (props.requireReason && !reason.value.trim())
})

const handleApprove = () => {
  if (isDisabled.value) return

  const trimmedReason = reason.value.trim()
  emit('update:modelValue', trimmedReason)
  emit('approve', trimmedReason || undefined)
}

const handleDeny = () => {
  if (isDisabled.value) return

  const trimmedReason = reason.value.trim()
  emit('update:modelValue', trimmedReason)
  emit('deny', trimmedReason || undefined)
}
</script>
