<template>
  <div
    :class="[
      'px-4 py-3 rounded-lg border',
      variantClasses[variant]
    ]"
  >
    <div class="text-xs mb-1" :class="variantLabelClasses[variant]">
      {{ label }}
    </div>
    <div class="text-sm whitespace-pre-wrap" :class="variantTextClasses[variant]">
      {{ content }}
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  content: string
  variant?: 'info' | 'warning' | 'error' | 'success'
  label?: string
}

withDefaults(defineProps<Props>(), {
  variant: 'info',
  label: 'Note'
})

const variantClasses = {
  info: 'bg-neutral-700/50 border-neutral-600',
  warning: 'bg-yellow-900/20 border-yellow-600/30',
  error: 'bg-red-900/20 border-red-600/30',
  success: 'bg-green-900/20 border-green-600/30'
}

const variantLabelClasses = {
  info: 'text-neutral-400',
  warning: 'text-yellow-400',
  error: 'text-red-400',
  success: 'text-green-400'
}

const variantTextClasses = {
  info: 'text-neutral-200',
  warning: 'text-yellow-200/80',
  error: 'text-red-200/80',
  success: 'text-green-200/80'
}
</script>
