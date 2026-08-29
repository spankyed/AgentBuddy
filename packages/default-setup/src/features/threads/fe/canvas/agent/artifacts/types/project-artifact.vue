<template>
  <div class="max-w-2xl">
    <div class="rounded-md bg-neutral-850 animate-fade-in">
      <!-- Header -->
      <div class="flex items-center gap-2 px-3 py-2 border-b border-neutral-700/30">
        <Layers :size="14" class="text-neutral-500" />
        <h3 class="text-sm font-medium text-neutral-200">
          {{ artifact.title || 'Project Configuration' }}
        </h3>
        <button
          @click="goToProjects"
          class="ml-auto text-xs text-blue-400 hover:text-blue-300 transition-colors"
        >
          Go to Projects →
        </button>
        <span class="text-xs text-neutral-500">({{ projects.length }})</span>
      </div>

      <!-- Projects List -->
      <div class="p-3">
        <div v-if="projects.length === 0" class="flex flex-col items-center justify-center py-8">
          <Layers :size="32" class="mb-2 text-neutral-600" />
          <p class="text-sm text-center text-neutral-400">No projects configured</p>
        </div>

        <div v-else class="space-y-3">
          <div v-for="project in projects" :key="project.name" class="border border-neutral-700/30 rounded-lg overflow-hidden">
            <!-- Project Header -->
            <div class="flex items-center gap-2 px-3 py-2 bg-neutral-800/30">
              <div
                class="flex-shrink-0 w-2 h-2 rounded-full"
                :style="{ backgroundColor: project.color }"
              ></div>
              <span class="text-sm text-neutral-200">{{ project.name }}</span>
            </div>

            <!-- Directories -->
            <div v-if="project.directories.length > 0" class="px-3 py-2 bg-neutral-900/20">
              <div class="flex items-center gap-1.5 flex-wrap">
                <span
                  v-for="(dir, idx) in project.directories"
                  :key="dir"
                  class="inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-xs font-mono"
                  :class="idx === 0 ? 'bg-blue-500/10 text-blue-400' : 'bg-neutral-700/30 text-neutral-400'"
                  :title="dir"
                >
                  <span
                    v-for="(segment, segIdx) in getTruncatedPath(dir)"
                    :key="segIdx"
                    class="inline-flex items-center gap-0.5"
                  >
                    <span v-if="segIdx > 0" class="opacity-50">/</span>
                    <span>{{ segment.name }}</span>
                  </span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Layers } from 'lucide-vue-next'
import type { ArtifactItem } from '@app/api'
import { truncatePath } from '@/core/utils/path-truncation'
import { applicationState } from '@/main'
import { navigateToPlugin } from '@/core/utils/navigate'
import { useSelector } from '@xstate/vue'

interface Project {
  name: string
  directories: string[]
  color: string
}

const props = defineProps<{
  artifact: ArtifactItem
}>()

// Read projects directly from settings state (single source of truth)
const settingsActor = applicationState.system.get('settings')
const projects = useSelector(
  settingsActor,
  (state: any) => state.context.settings?.general?.projects || []
)

const getTruncatedPath = (path: string) => {
  return truncatePath(path, 4)
}

const goToProjects = () => {
  navigateToPlugin('settings', [
    { type: 'TAB.SELECT', tab: 'general' },
    { type: 'GENERAL_NAV.SELECT', item: 'projects' }
  ])
}
</script>

<style scoped>
/* Smooth animations */
.animate-fade-in {
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
