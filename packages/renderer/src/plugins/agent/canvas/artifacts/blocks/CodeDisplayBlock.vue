<template>
  <div class="code-display-block bg-neutral-900 rounded-lg border border-neutral-700 overflow-hidden">
    <div class="flex items-center justify-between px-4 py-2 bg-neutral-800 border-b border-neutral-700">
      <span class="text-xs text-neutral-400 font-mono">{{ language }}</span>
      <button
        @click="copyCode"
        class="text-xs text-neutral-400 hover:text-primary-400 transition-colors px-2 py-1 rounded hover:bg-neutral-700"
      >
        <Check v-if="copied" class="w-4 h-4" />
        <Copy v-else class="w-4 h-4" />
      </button>
    </div>
    <pre class="p-4 overflow-x-auto text-sm"><code class="font-mono">{{ code }}</code></pre>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Copy, Check } from 'lucide-vue-next'

interface Props {
  code: string
  language?: string
}

const props = withDefaults(defineProps<Props>(), {
  language: 'plaintext'
})

const copied = ref(false)

const copyCode = async () => {
  try {
    await navigator.clipboard.writeText(props.code)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch (err) {
    console.error('Failed to copy code:', err)
  }
}
</script>
