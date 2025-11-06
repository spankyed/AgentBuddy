<template>
  <div class="image-display-block rounded-lg border border-neutral-700 overflow-hidden bg-neutral-900">
    <img
      :src="imageUrl"
      :alt="alt || 'Artifact image'"
      class="w-full h-auto object-contain max-h-[600px]"
      @error="handleImageError"
    />
    <div v-if="alt" class="px-4 py-2 bg-neutral-800 border-t border-neutral-700">
      <p class="text-sm text-neutral-400">{{ alt }}</p>
    </div>
    <div v-if="imageError" class="p-4 text-center text-red-400">
      <p>Failed to load image</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

interface Props {
  imageUrl: string
  alt?: string
}

defineProps<Props>()

const imageError = ref(false)

const handleImageError = () => {
  imageError.value = true
}
</script>
