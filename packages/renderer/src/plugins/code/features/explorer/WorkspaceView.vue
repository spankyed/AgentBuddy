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
      <div v-for="(workspace, wsIndex) in workspaces" :key="workspace.name" class="mb-4">
        <!-- Workspace header -->
        <TreeItemWithMenu
          :terminal-path="workspace.directory"
          @open-terminal="$emit('open-terminal', $event)"
        >
          <div
            @click="handleWorkspaceClick(workspace)"
            class="flex items-center gap-2 px-4 py-2 transition-colors"
            :class="workspace.directory ? 'cursor-pointer hover:bg-neutral-800' : 'cursor-default'"
          >
            <div
              class="flex-shrink-0 w-3 h-3 rounded"
              :style="{ backgroundColor: workspace.color }"
            ></div>
            <div class="flex-1 min-w-0 flex items-baseline gap-2">
              <span class="font-medium text-neutral-200 flex-shrink-0">{{ workspace.name }}</span>
              <span
                v-if="workspace.directory"
                class="text-xs text-neutral-500 truncate"
                :title="workspace.directory"
              >
                {{ workspace.directory }}
              </span>
            </div>
          </div>
        </TreeItemWithMenu>

        <!-- Projects list -->
        <div v-if="workspace.projects.length > 0" class="relative ml-6">
          <!-- Workspace depth guideline -->
          <div class="absolute left-0 top-0 bottom-0 w-px bg-neutral-700"></div>

          <div v-for="(project, projectIdx) in workspace.projects" :key="project.name" class="mb-2">
            <!-- Project header -->
            <TreeItemWithMenu
              :terminal-path="project.directories.length > 0 ? project.directories[0] : undefined"
              @open-terminal="$emit('open-terminal', $event)"
            >
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
            </TreeItemWithMenu>

            <!-- Directories list -->
            <div v-if="project.directories.length > 0" class="relative ml-4">
              <!-- Project depth guideline -->
              <div
                class="absolute left-0 top-0 w-px bg-neutral-700"
                :class="projectIdx === workspace.projects.length - 1 && project.directories.length > 0 ? 'h-6' : 'bottom-0'"
              ></div>

              <TreeItemWithMenu
                v-for="(dir, idx) in project.directories"
                :key="dir"
                :terminal-path="dir"
                @open-terminal="$emit('open-terminal', $event)"
              >
                <div
                  @click="handleDirectoryClick(dir)"
                  class="group relative flex items-center gap-2 px-4 py-1 text-xs transition-colors cursor-pointer text-neutral-400 hover:bg-neutral-800"
                >
                  <!-- Connection line to guideline -->
                  <div class="absolute left-0 top-1/2 w-3 h-px bg-neutral-700"></div>

                  <span class="flex-1 truncate" :title="dir">{{ getDirectoryName(dir) }}</span>

                  <!-- Remove button -->
                  <button
                    @click="(e) => handleRemoveDirectory(e, dir, wsIndex, projectIdx)"
                    class="flex-shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/20 hover:text-red-400"
                    title="Remove directory"
                  >
                    <X class="w-3 h-3" />
                  </button>
                </div>
              </TreeItemWithMenu>
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
import { Layers, X } from 'lucide-vue-next'
import TreeItemWithMenu from './components/TreeItemWithMenu.vue'
import { useWorkspaceActions } from './composables/useWorkspaceActions'

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

const { removeDirectoryFromProject } = useWorkspaceActions()

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

const handleRemoveDirectory = (event: Event, dir: string, wsIndex: number, pIndex: number) => {
  event.stopPropagation() // Prevent triggering handleDirectoryClick
  removeDirectoryFromProject(dir, wsIndex, pIndex)
}
</script>
