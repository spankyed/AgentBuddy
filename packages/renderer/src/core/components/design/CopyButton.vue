<template>
  <button
    @click="copyToClipboard"
    class="p-1 transition-colors rounded text-neutral-500 hover:text-neutral-200 hover:bg-neutral-700"
    title="Copy to clipboard"
  >
    <component :is="copied ? Check : Copy" :size="14" />
  </button>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Copy, Check } from 'lucide-vue-next'

const props = defineProps<{ text: string }>()

const copied = ref(false)

function copyToClipboard() {
  navigator.clipboard.writeText(props.text)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}
</script>
