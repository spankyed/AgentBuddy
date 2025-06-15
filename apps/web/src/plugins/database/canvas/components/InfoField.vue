<template>
  <div>
    <label 
      :class="[
        'block font-medium text-gray-500 dark:text-gray-400',
        small ? 'text-xs' : 'text-xs'
      ]"
    >
      {{ label }}
    </label>
    <p 
      :class="[
        'text-gray-900 dark:text-gray-100 break-all',
        small ? 'text-xs' : 'text-sm',
        monospace && 'font-mono'
      ]"
    >
      {{ value }}
    </p>
  </div>
</template>

<script setup lang="ts">
interface Props {
  label: string;
  value: string;
  monospace?: boolean;
  small?: boolean;
}

defineProps<Props>();
</script> 