<template>
  <div class="max-w-2xl mx-auto">
    <div class="rounded-md bg-neutral-900 animate-fade-in">
      <!-- Header -->
      <div class="flex items-center gap-2 px-3 py-2 border-b border-neutral-700/30">
        <Layers :size="14" class="text-neutral-500" />
        <h3 class="text-sm font-medium text-neutral-200">
          {{ artifact.title || 'Workspace Configuration' }}
        </h3>
        <button
          @click="goToWorkspaces"
          class="ml-auto text-xs text-blue-400 hover:text-blue-300 transition-colors"
        >
          Go to Workspaces →
        </button>
        <span class="text-xs text-neutral-500">({{ workspaces.length }})</span>
      </div>

      <!-- Workspaces List -->
      <div class="p-3">
        <div v-if="workspaces.length === 0" class="flex flex-col items-center justify-center py-8">
          <Layers :size="32" class="mb-2 text-neutral-600" />
          <p class="text-sm text-center text-neutral-400">No workspaces configured</p>
        </div>

        <div v-else class="space-y-3">
          <div v-for="workspace in workspaces" :key="workspace.name" class="border border-neutral-700/30 rounded-lg overflow-hidden">
            <!-- Workspace Header -->
            <div class="flex items-center gap-2 px-3 py-2 bg-neutral-800/30">
              <div
                class="flex-shrink-0 w-3 h-3 rounded"
                :style="{ backgroundColor: workspace.color }"
              ></div>
              <span class="font-medium text-neutral-200">{{ workspace.name }}</span>
              <div
                v-if="workspace.directory"
                class="flex items-center gap-0.5 text-xs font-mono text-neutral-500 flex-1 min-w-0"
                :title="workspace.directory"
              >
                <span
                  v-for="(segment, idx) in getTruncatedPath(workspace.directory)"
                  :key="idx"
                  class="flex items-center gap-0.5"
                >
                  <span v-if="idx > 0" class="text-neutral-600">/</span>
                  <span :class="{ 'text-neutral-400': segment.isEllipsis }">{{ segment.name }}</span>
                </span>
              </div>
              <span class="ml-auto text-xs text-neutral-500 flex-shrink-0">({{ workspace.projects.length }})</span>
            </div>

            <!-- Workspace Details -->
            <div v-if="workspace.description" class="px-3 py-2 space-y-1.5 bg-neutral-800/10">
              <!-- Description -->
              <div class="flex items-start gap-2">
                <span class="text-xs text-neutral-500 flex-shrink-0">Description:</span>
                <span class="text-xs text-neutral-300">{{ workspace.description }}</span>
              </div>
            </div>

            <!-- Projects List -->
            <div v-if="workspace.projects.length > 0" class="px-3 py-2 bg-neutral-900/20">
              <div v-for="project in workspace.projects" :key="project.name" class="mb-2 last:mb-0">
                <!-- Project Header -->
                <div class="flex items-center gap-2 px-2 py-1.5 bg-neutral-800/30 rounded">
                  <div
                    class="flex-shrink-0 w-2 h-2 rounded-full"
                    :style="{ backgroundColor: project.color }"
                  ></div>
                  <span class="text-sm text-neutral-200">{{ project.name }}</span>
                </div>

                <!-- Directories -->
                <div v-if="project.directories.length > 0" class="mt-1 ml-4">
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
    </div>
  </div>
</template>

<script setup lang="ts">
import { Layers } from 'lucide-vue-next'
import type { ArtifactItem } from '@app/api'
import { truncatePath } from '@/core/utils/path-truncation'
import { applicationState } from '@/main'
import { useSelector } from '@xstate/vue'

interface WorkspaceProject {
  name: string
  directories: string[]
  color: string
}

interface Workspace {
  name: string
  description?: string
  directory?: string
  color: string
  projects: WorkspaceProject[]
}

const props = defineProps<{
  artifact: ArtifactItem
}>()

// Read workspaces directly from settings state (single source of truth)
const settingsActor = applicationState.system.get('settings')
const workspaces = useSelector(
  settingsActor,
  (state: any) => state.context.settings?.general?.workspaces?.workspaces || []
)

const getDirectoryName = (path: string) => {
  // Get the last part of the path for display
  return path.split('/').filter(Boolean).pop() || path
}

const getTruncatedPath = (path: string) => {
  return truncatePath(path, 4)
}

const goToWorkspaces = () => {
  // Navigate to settings plugin
  applicationState.send({ type: 'SELECT_PLUGIN', pluginId: 'settings' })

  // Switch to general tab and navigate to workspaces
  settingsActor?.send({ type: 'TAB.SELECT', tab: 'general' })
  settingsActor?.send({ type: 'GENERAL_NAV.SELECT', item: 'workspaces' })
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
