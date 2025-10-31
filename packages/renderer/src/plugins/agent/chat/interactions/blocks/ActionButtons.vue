<template>
  <div class="flex items-center gap-2">
    <button
      v-if="buttons.includes('submit')"
      @click="$emit('submit')"
      :disabled="submitDisabled"
      :class="[
        'px-4 py-2 rounded-lg transition-colors text-sm font-medium',
        submitDisabled
          ? 'bg-neutral-700 text-neutral-500 cursor-not-allowed'
          : submitVariantClasses[submitVariant]
      ]"
    >
      {{ submitLabel || 'Submit' }}
    </button>

    <button
      v-if="buttons.includes('cancel')"
      @click="$emit('cancel')"
      class="px-4 py-2 bg-neutral-700 hover:bg-neutral-600 text-neutral-300 rounded-lg border border-neutral-600 transition-colors text-sm"
    >
      {{ cancelLabel || 'Cancel' }}
    </button>
  </div>
</template>

<script setup lang="ts">
interface Props {
  buttons: ('submit' | 'cancel')[]
  submitDisabled?: boolean
  submitVariant?: 'primary' | 'success' | 'danger'
  submitLabel?: string
  cancelLabel?: string
}

interface Emits {
  (e: 'submit'): void
  (e: 'cancel'): void
}

const props = withDefaults(defineProps<Props>(), {
  submitDisabled: false,
  submitVariant: 'primary'
})

defineEmits<Emits>()

const submitVariantClasses = {
  primary: 'bg-indigo-600 hover:bg-indigo-500 text-white',
  success: 'bg-green-600 hover:bg-green-500 text-white',
  danger: 'bg-red-600 hover:bg-red-500 text-white'
}
</script>
