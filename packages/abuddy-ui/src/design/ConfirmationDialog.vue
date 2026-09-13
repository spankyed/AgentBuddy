<template>
  <DialogRoot :open="modelValue" @update:open="handleOpenChange">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
      <DialogContent
        class="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-neutral-800 border border-neutral-700 rounded-lg p-6 w-[90vw] max-w-md shadow-xl z-50"
      >
        <DialogTitle class="text-lg font-semibold text-white mb-2">
          {{ title }}
        </DialogTitle>
        <DialogDescription class="text-sm text-neutral-400 mb-4">
          {{ description }}
        </DialogDescription>
        <slot />
        <div class="flex justify-end gap-3 mt-4">
          <Button
            variant="ghost"
            class="text-neutral-300"
            @click="handleCancel"
          >
            {{ cancelText }}
          </Button>
          <Button
            :variant="confirmButtonVariant"
            :class="confirmButtonClass"
            @click="handleConfirm"
          >
            {{ confirmText }}
          </Button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  DialogRoot,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from 'reka-ui'
import Button from './button.vue'

export type ConfirmationVariant = 'danger' | 'warning' | 'info'

interface Props {
  modelValue: boolean
  title?: string
  description: string
  itemName?: string
  confirmText?: string
  cancelText?: string
  variant?: ConfirmationVariant
}

const props = withDefaults(defineProps<Props>(), {
  title: 'Confirm Action',
  confirmText: 'Confirm',
  cancelText: 'Cancel',
  variant: 'danger'
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'confirm': []
  'cancel': []
}>()

// Computed properties for button styling based on variant
const confirmButtonVariant = computed(() => {
  switch (props.variant) {
    case 'danger':
      return 'danger' as const
    case 'warning':
      return 'primary' as const
    case 'info':
    default:
      return 'primary' as const
  }
})

const confirmButtonClass = computed(() => {
  switch (props.variant) {
    case 'danger':
      return 'bg-red-600 hover:bg-red-700 text-white'
    case 'warning':
      return 'bg-amber-600 hover:bg-amber-700 text-white'
    case 'info':
    default:
      return ''
  }
})

// Handlers
const handleOpenChange = (open: boolean) => {
  emit('update:modelValue', open)
  if (!open) {
    emit('cancel')
  }
}

const handleConfirm = () => {
  emit('confirm')
  emit('update:modelValue', false)
}

const handleCancel = () => {
  emit('cancel')
  emit('update:modelValue', false)
}
</script>