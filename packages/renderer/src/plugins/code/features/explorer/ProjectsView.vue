<template>
  <div class="flex-1 overflow-auto">
    <div v-if="projects.length === 0" class="flex flex-col items-center justify-center flex-1 p-4">
      <Layers :size="48" class="mb-3 text-neutral-600" />
      <p class="text-center text-neutral-400">No projects configured</p>
      <p class="mt-2 text-xs text-center text-neutral-500">
        Add projects in Settings → General → Projects
      </p>
    </div>

    <div v-else class="py-2">
      <div v-for="(project, pIndex) in projects" :key="project.name" class="mb-2">
        <!-- Project header -->
        <TreeItemWithMenu
          :terminal-path="project.directories.length > 0 ? project.directories[0] : undefined"
          @open-terminal="$emit('open-terminal', $event)"
        >
          <div
            @click="handleProjectClick(project)"
            class="group flex items-center gap-2 px-4 py-1.5 transition-colors cursor-pointer hover:bg-neutral-800"
          >
            <div
              class="flex-shrink-0 w-2 h-2 rounded-full"
              :style="{ backgroundColor: project.color }"
            ></div>
            <span class="flex-1 text-sm truncate text-neutral-200">{{ project.name }}</span>

            <!-- Add Directory Button -->
            <button
              @click="(e) => handleAddDirectoryToProject(e, pIndex)"
              class="flex-shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-blue-500/20 hover:text-blue-400 text-neutral-500"
              title="Add directory to project"
            >
              <Plus class="w-3 h-3" />
            </button>
          </div>
        </TreeItemWithMenu>

        <!-- Directories list -->
        <div v-if="project.directories.length > 0" class="relative ml-6">
          <!-- Project depth guideline -->
          <div class="absolute left-0 top-0 bottom-0 w-px bg-neutral-700"></div>

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
                @click="(e) => handleRemoveDirectory(e, dir, pIndex)"
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
  </div>
</template>

<script setup lang="ts">
import { Layers, X, Plus } from 'lucide-vue-next'
import TreeItemWithMenu from './components/TreeItemWithMenu.vue'
import { useProjectActions } from './composables/useProjectActions'

interface Project {
  name: string
  directories: string[]
  color: string
}

defineProps<{
  projects: Project[]
}>()

const emit = defineEmits<{
  'set-directory': [path: string]
  'open-terminal': [path: string]
}>()

const {
  removeDirectoryFromProject,
  addDirectoryToProject,
  checkDuplicateDirectory
} = useProjectActions()

const handleProjectClick = (project: Project) => {
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

const handleRemoveDirectory = (event: Event, dir: string, pIndex: number) => {
  event.stopPropagation() // Prevent triggering handleDirectoryClick
  removeDirectoryFromProject(dir, pIndex)
}

const handleAddDirectoryToProject = async (event: Event, pIndex: number) => {
  event.stopPropagation() // Prevent triggering handleProjectClick

  if (!window.electronAPI?.fileUtils.selectDirectory) {
    console.error('Directory selection API not available')
    return
  }

  try {
    const directoryPath = await window.electronAPI.fileUtils.selectDirectory()
    if (!directoryPath) return

    // Check for duplicates
    if (checkDuplicateDirectory(directoryPath)) {
      alert('This directory is already added to a project')
      return
    }

    addDirectoryToProject(directoryPath, pIndex)
  } catch (error) {
    console.error('Error adding directory:', error)
  }
}
</script>
