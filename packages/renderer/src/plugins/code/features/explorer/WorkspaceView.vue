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
            class="flex-shrink-0 w-3 h-3 rounded-full"
            :style="{ backgroundColor: workspace.color }"
          ></div>
          <span class="font-medium truncate text-neutral-200">{{ workspace.name }}</span>
          <FolderOpen
            v-if="workspace.directory"
            class="flex-shrink-0 w-3 h-3 ml-auto text-neutral-500"
          />
        </div>

        <!-- Workspace description -->
        <div v-if="workspace.description" class="px-4 pb-2 ml-5 text-xs text-neutral-500">
          {{ workspace.description }}
        </div>

        <!-- Projects list -->
        <div v-if="workspace.projects.length > 0" class="ml-6">
          <div v-for="project in workspace.projects" :key="project.name" class="mb-2">
            <!-- Project header -->
            <div
              @click="handleProjectClick(project)"
              class="flex items-center gap-2 px-4 py-1.5 transition-colors cursor-pointer hover:bg-neutral-800"
            >
              <div
                class="flex-shrink-0 w-2 h-2 rounded-full"
                :style="{ backgroundColor: project.color }"
              ></div>
              <span class="text-sm truncate text-neutral-200">{{ project.name }}</span>
              <FolderOpen class="flex-shrink-0 w-3 h-3 ml-auto text-neutral-500" />
            </div>

            <!-- Directories list -->
            <div v-if="project.directories.length > 0" class="ml-4">
              <div
                v-for="(dir, idx) in project.directories"
                :key="dir"
                @click="handleDirectoryClick(dir)"
                class="flex items-center gap-2 px-4 py-1 text-xs transition-colors cursor-pointer text-neutral-400 hover:bg-neutral-800"
              >
                <Folder class="flex-shrink-0 w-3 h-3" />
                <span class="flex-1 truncate" :title="dir">{{ getDirectoryName(dir) }}</span>
                <span v-if="idx === 0" class="flex-shrink-0 ml-auto text-neutral-600">(primary)</span>
              </div>
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
import { Layers, FolderOpen, Folder } from 'lucide-vue-next'

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
