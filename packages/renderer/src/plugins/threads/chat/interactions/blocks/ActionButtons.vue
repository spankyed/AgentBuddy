<template>
  <div class="flex items-center gap-2">
    <Button
      v-if="buttons.includes('submit')"
      @click="$emit('submit')"
      :disabled="submitDisabled"
      :variant="buttonVariant"
      :class="submitVariant === 'success' ? 'bg-green-600 hover:bg-green-500' : ''"
    >
      {{ submitLabel || 'Submit' }}
    </Button>

    <Button
      v-if="buttons.includes('cancel')"
      @click="$emit('cancel')"
      variant="secondary"
    >
      {{ cancelLabel || 'Cancel' }}
    </Button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import Button from '@/core/components/design/button.vue'

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

const buttonVariant = computed(() => {
  if (props.submitVariant === 'success') return 'primary'
  return props.submitVariant
})
</script>
