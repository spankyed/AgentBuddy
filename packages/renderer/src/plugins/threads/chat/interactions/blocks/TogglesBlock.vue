<template>
  <div class="toggles-block">
    <!-- Response display (disabled) -->
    <template v-if="disabled">
      <div v-if="responseToggles" class="flex items-center gap-3 pt-1">
        <span
          v-for="(value, id) in responseToggles"
          :key="String(id)"
          class="text-xs text-neutral-500"
        >
          {{ labelFor(String(id)) }}: <span :class="value ? 'text-green-500' : 'text-neutral-400'">{{ value ? 'On' : 'Off' }}</span>
        </span>
      </div>
    </template>

    <!-- Interactive toggles -->
    <div v-else class="space-y-1.5 pt-1">
      <div
        v-for="toggle in toggles"
        :key="toggle.id"
        class="flex items-center gap-2.5"
      >
        <button
          type="button"
          @click="values[toggle.id] = !values[toggle.id]"
          :class="[
            'relative w-8 h-[18px] rounded-full transition-colors flex-shrink-0',
            values[toggle.id] ? 'bg-blue-600' : 'bg-neutral-600',
          ]"
        >
          <span
            :class="[
              'absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform',
              values[toggle.id] ? 'left-[16px]' : 'left-[2px]',
            ]"
          />
        </button>
        <span class="text-sm text-neutral-300">{{ toggle.label }}</span>
        <span v-if="toggle.description" class="text-xs text-neutral-500">{{ toggle.description }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, watch, computed } from 'vue'

interface ToggleConfig {
  id: string
  label: string
  description?: string
  default?: boolean
}

interface Props {
  toggles: ToggleConfig[]
  disabled?: boolean
  response?: any
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
})

const values = reactive<Record<string, boolean>>({})

watch(() => props.toggles, (t) => {
  if (t) t.forEach(tog => { values[tog.id] ??= tog.default ?? false })
}, { immediate: true })

const responseToggles = computed(() => {
  const r = props.response
  return r && typeof r === 'object' && !Array.isArray(r) && r.toggles ? r.toggles : null
})

const labelFor = (id: string) => props.toggles.find(t => t.id === id)?.label ?? id

/** Expose current values so the parent container can read them. */
defineExpose({ values })
</script>
