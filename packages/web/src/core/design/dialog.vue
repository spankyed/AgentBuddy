<template>
  <DialogRoot v-model:open="isOpen">
    <DialogPortal>
      <DialogOverlay class="dialog-overlay" />
      <DialogContent class="dialog-content">
        <DialogTitle v-if="props.title" class="dialog-title">
          {{ props.title }}
        </DialogTitle>
        <DialogDescription v-if="props.description" class="dialog-description">
          {{ props.description }}
        </DialogDescription>
        
        <div v-if="$slots.default" class="dialog-body">
          <slot />
        </div>

        <div v-if="$slots.actions || props.showDefaultActions" class="dialog-actions">
          <slot name="actions">
            <button
              v-if="props.showDefaultActions"
              type="button"
              class="dialog-button cancel"
              @click="handleCancel"
            >
              {{ props.cancelText || 'Cancel' }}
            </button>
            <button
              v-if="props.showDefaultActions"
              type="submit"
              class="dialog-button submit"
              @click="handleConfirm"
            >
              {{ props.confirmText || 'Confirm' }}
            </button>
          </slot>
        </div>

        <DialogClose v-if="props.showCloseButton" class="dialog-close">
          <X :size="20" />
        </DialogClose>
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
  DialogClose,
} from 'reka-ui'
import { X } from 'lucide-vue-next'

const props = defineProps<{
  modelValue?: boolean
  title?: string
  description?: string
  showDefaultActions?: boolean
  cancelText?: string
  confirmText?: string
  showCloseButton?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'confirm'): void
  (e: 'cancel'): void
}>()

const isOpen = computed({
  get: () => props.modelValue ?? false,
  set: (value) => emit('update:modelValue', value)
})

function handleConfirm() {
  emit('confirm')
}

function handleCancel() {
  emit('cancel')
  isOpen.value = false
}
</script>

<style scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
  z-index: 50;
  animation: overlayShow 150ms cubic-bezier(0.16, 1, 0.3, 1);
}

.dialog-content {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: #161616;
  border: 1px solid #262626;
  border-radius: 12px;
  padding: 24px;
  width: 90vw;
  max-width: 450px;
  max-height: 85vh;
  z-index: 51;
  animation: contentShow 150ms cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 10px 38px -10px rgba(0, 0, 0, 0.75), 0 10px 20px -15px rgba(0, 0, 0, 0.4);
}

.dialog-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #e0e0e0;
}

.dialog-description {
  margin: 10px 0 20px;
  font-size: 14px;
  color: #666;
  line-height: 1.5;
}

.dialog-body {
  margin: 20px 0;
}

.dialog-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 20px;
}

.dialog-button {
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  outline: none;
}

.dialog-button.cancel {
  background: transparent;
  border: 1px solid #262626;
  color: #e0e0e0;
}

.dialog-button.cancel:hover {
  background: #1a1a1a;
  border-color: #333;
}

.dialog-button.submit {
  background: linear-gradient(135deg, #00bcd4 0%, #0097a7 100%);
  border: 1px solid #00bcd4;
  color: #fff;
}

.dialog-button.submit:hover {
  background: linear-gradient(135deg, #00d4e6 0%, #00acc1 100%);
  border-color: #00d4e6;
  box-shadow: 0 2px 8px rgba(0, 188, 212, 0.3);
}

.dialog-close {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid #262626;
  border-radius: 6px;
  color: #666;
  cursor: pointer;
  transition: all 0.2s;
}

.dialog-close:hover {
  background: #1a1a1a;
  border-color: #333;
  color: #e0e0e0;
}

@keyframes overlayShow {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes contentShow {
  from {
    opacity: 0;
    transform: translate(-50%, -48%) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
}
</style> 