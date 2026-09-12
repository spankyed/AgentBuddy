<template>
  <div class="project-select-input">
    <!-- Response Display (when disabled/responded) -->
    <div v-if="disabled && response" class="space-y-2">
      <div class="flex items-center gap-2 text-sm text-neutral-400 mb-2">
        <Check class="w-4 h-4 text-green-500" />
        <span>{{ displayText || 'Selected project:' }}</span>
      </div>
      <div class="flex items-center gap-2.5 px-3 py-2 bg-neutral-700/30 rounded-lg border border-neutral-600/50">
        <div
          v-if="selectedProject?.color"
          class="w-2.5 h-2.5 rounded-full flex-shrink-0"
          :style="{ backgroundColor: selectedProject.color }"
        />
        <span class="text-sm text-neutral-300">{{ selectedProject?.name || selectedDir }}</span>
        <span class="text-xs text-neutral-500 truncate">{{ selectedProject?.directories?.[0] || '' }}</span>
      </div>
    </div>

    <!-- Input Controls (when not disabled/not responded) -->
    <div v-else-if="projects.length === 0" class="px-3 py-2 text-sm text-neutral-500 italic">
      No projects configured
    </div>
    <div v-else class="space-y-1.5">
      <button
        v-for="project in projects"
        :key="project.name"
        type="button"
        :disabled="disabled"
        @click="selectProject(project)"
        :class="[
          'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all text-left',
          disabled
            ? 'cursor-not-allowed opacity-50 bg-neutral-700/30 border-neutral-700'
            : 'bg-neutral-800/60 border-neutral-700 hover:bg-neutral-700/60 hover:border-neutral-500 cursor-pointer',
        ]"
      >
        <div
          class="w-2.5 h-2.5 rounded-full flex-shrink-0"
          :style="{ backgroundColor: project.color || '#3B82F6' }"
        />
        <div class="flex-1 min-w-0">
          <div class="text-sm font-medium text-neutral-200 truncate">{{ project.name }}</div>
          <div class="text-xs text-neutral-500 truncate">{{ project.directories?.[0] || '' }}</div>
        </div>
        <ChevronRight class="w-4 h-4 text-neutral-600 flex-shrink-0" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Check, ChevronRight } from 'lucide-vue-next'

interface Project {
  name: string
  directories: string[]
  color: string
}

interface Props {
  projects: Project[]
  disabled?: boolean
  response?: any
  displayText?: string
}

interface Emits {
  (e: 'submit', value: string): void
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
})

const emit = defineEmits<Emits>()

const selectedDir = computed(() => {
  if (!props.response) return ''
  return typeof props.response === 'string' ? props.response : props.response?.path ?? ''
})

const selectedProject = computed(() => {
  if (!selectedDir.value) return null
  return props.projects.find(p => p.directories?.[0] === selectedDir.value) ?? null
})

const selectProject = (project: Project) => {
  if (props.disabled) return
  const dir = project.directories?.[0]
  if (dir) emit('submit', dir)
}
</script>
