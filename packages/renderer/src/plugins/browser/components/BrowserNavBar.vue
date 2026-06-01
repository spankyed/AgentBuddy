<template>
  <div class="flex items-center gap-2 px-3 py-1.5 bg-neutral-900 border-b border-neutral-800">
    <!-- Back -->
    <button
      class="p-1.5 rounded-md transition-colors"
      :class="canGoBack ? 'text-neutral-300 hover:bg-neutral-800' : 'text-neutral-600 cursor-default'"
      :disabled="!canGoBack"
      @click="$emit('back')"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
    </button>

    <!-- Forward -->
    <button
      class="p-1.5 rounded-md transition-colors"
      :class="canGoForward ? 'text-neutral-300 hover:bg-neutral-800' : 'text-neutral-600 cursor-default'"
      :disabled="!canGoForward"
      @click="$emit('forward')"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
    </button>

    <!-- Reload / Stop -->
    <button
      class="p-1.5 rounded-md text-neutral-300 hover:bg-neutral-800 transition-colors"
      @click="isLoading ? $emit('stop') : $emit('reload')"
    >
      <!-- Stop icon -->
      <svg v-if="isLoading" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      <!-- Reload icon -->
      <svg v-else xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
    </button>

    <!-- Address bar -->
    <form class="flex-1" @submit.prevent="$emit('navigate', addressBarValue)">
      <input
        ref="addressInput"
        type="text"
        :value="addressBarValue"
        @input="$emit('update:addressBarValue', ($event.target as HTMLInputElement).value)"
        @focus="$emit('focus')"
        @blur="$emit('blur')"
        @keydown.escape="($event.target as HTMLInputElement).blur()"
        class="w-full px-3 py-1.5 text-sm bg-neutral-800 border border-neutral-700 rounded-lg outline-none text-neutral-200 placeholder-neutral-500 focus:border-neutral-500 transition-colors"
        placeholder="Enter URL or search..."
      />
    </form>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  addressBarValue: string;
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
}>();

defineEmits<{
  back: [];
  forward: [];
  reload: [];
  stop: [];
  navigate: [url: string];
  'update:addressBarValue': [value: string];
  focus: [];
  blur: [];
}>();
</script>
