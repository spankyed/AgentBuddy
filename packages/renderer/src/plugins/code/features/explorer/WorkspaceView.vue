<template>
  <div class="flex-1 overflow-auto">
    <div v-if="workspaces.length === 0" class="flex flex-col items-center justify-center flex-1 p-4">
      <Layers :size="48" class="mb-3 text-neutral-600" />
      <p class="text-center text-neutral-400">No workspaces configured</p>
      <p class="mt-2 text-xs text-center text-neutral-500">
        Add workspaces in Settings → General → Workspaces
      </p>
    </div>

    <div v-else class="py-2">
      <div v-for="workspace in workspaces" :key="workspace.name" class="mb-4">
        <!-- Workspace header -->
        <div
          @click="handleWorkspaceClick(workspace)"
          class="flex items-center gap-2 px-4 py-2 transition-colors"
          :class="workspace.directory ? 'cursor-pointer hover:bg-neutral-800' : 'cursor-default'"
        >
          <div
            class="flex-shrink-0 w-3 h-3 rounded"
            :style="{ backgroundColor: workspace.color }"
          ></div>
          <span class="font-medium truncate text-neutral-200">{{ workspace.name }}</span>
        </div>

        <!-- Projects list -->
        <div v-if="workspace.projects.length > 0" class="relative ml-6">
          <!-- Workspace depth guideline -->
          <div class="absolute left-0 top-0 bottom-0 w-px bg-neutral-700"></div>

          <div v-for="(project, projectIdx) in workspace.projects" :key="project.name" class="mb-2">
            <!-- Project header -->
            <div
              @click="handleProjectClick(project)"
              class="relative flex items-center gap-2 px-4 py-1.5 transition-colors cursor-pointer hover:bg-neutral-800"
            >
              <!-- Connection line to guideline -->
              <div class="absolute left-0 top-1/2 w-3 h-px bg-neutral-700"></div>

              <div
                class="flex-shrink-0 w-2 h-2 rounded-full"
                :style="{ backgroundColor: project.color }"
              ></div>
              <span class="text-sm truncate text-neutral-200">{{ project.name }}</span>
            </div>

            <!-- Directories list -->
            <div v-if="project.directories.length > 0" class="relative ml-4">
              <!-- Project depth guideline -->
              <div
                class="absolute left-0 top-0 w-px bg-neutral-700"
                :class="projectIdx === workspace.projects.length - 1 && project.directories.length > 0 ? 'h-6' : 'bottom-0'"
              ></div>

              <ContextMenuRoot
                v-for="(dir, idx) in project.directories"
                :key="dir"
              >
                <ContextMenuTrigger as-child>
                  <div
                    @click="handleDirectoryClick(dir)"
                    class="relative flex items-center gap-2 px-4 py-1 text-xs transition-colors cursor-pointer text-neutral-400 hover:bg-neutral-800"
                  >
                    <!-- Connection line to guideline -->
                    <div class="absolute left-0 top-1/2 w-3 h-px bg-neutral-700"></div>

                    <span class="flex-1 truncate" :title="dir">{{ getDirectoryName(dir) }}</span>
                  </div>
                </ContextMenuTrigger>

                <ContextMenuPortal>
                  <ContextMenuContent :class="MENU_CONTENT_CLASS">
                    <ContextMenuItem
                      @select="$emit('open-terminal', dir)"
                      :class="MENU_ITEM_CLASS"
                    >
                      <Terminal class="w-4 h-4" />
                      Open Terminal Here
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenuPortal>
              </ContextMenuRoot>
            </div>
          </div>
        </div>

        <!-- Show message if workspace has no projects -->
        <div v-else class="px-4 py-2 ml-6 text-xs text-neutral-500">
          No projects in this workspace
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Layers, Terminal } from 'lucide-vue-next'
import {
  ContextMenuRoot,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuPortal,
} from 'reka-ui'
import { MENU_ITEM_CLASS, MENU_CONTENT_CLASS } from './constants'

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

defineProps<{
  workspaces: Workspace[]
}>()

const emit = defineEmits<{
  'set-directory': [path: string]
  'open-terminal': [path: string]
}>()

const handleWorkspaceClick = (workspace: Workspace) => {
  if (workspace.directory) {
    emit('set-directory', workspace.directory)
  }
}

const handleProjectClick = (project: WorkspaceProject) => {
  if (project.directories.length > 0) {
    // Open the primary (first) directory
    emit('set-directory', project.directories[0])
  }
}

const handleDirectoryClick = (directory: string) => {
  emit('set-directory', directory)
}

const getDirectoryName = (path: string) => {
  // Get the last part of the path for display
  return path.split('/').filter(Boolean).pop() || path
}
</script>
