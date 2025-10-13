<template>
  <div class="max-w-4xl">
    <p class="text-sm text-neutral-500 mb-6">
      Organize your projects into workspaces. Each project can contain multiple directories.
    </p>

    <div class="space-y-3">
      <!-- Workspace Cards -->
      <div
        v-for="(workspace, wsIndex) in workspaces"
        :key="`workspace-${wsIndex}`"
        class="border border-neutral-700 rounded-lg overflow-hidden bg-neutral-900"
      >
        <!-- Workspace Header -->
        <div class="bg-neutral-800/50 px-4 py-3 border-b border-neutral-700">
          <div class="flex items-center gap-2">
            <!-- Collapse/Expand Button -->
            <button
              @click="toggleWorkspaceCollapse(wsIndex)"
              class="p-1 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700 rounded transition-all flex-shrink-0"
              :title="collapsedWorkspaces.has(wsIndex) ? 'Expand' : 'Collapse'"
            >
              <svg
                class="w-4 h-4 transition-transform"
                :class="{ 'rotate-180': !collapsedWorkspaces.has(wsIndex) }"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            <!-- Color Badge with Picker -->
            <div class="relative color-picker-container">
              <button
                @click.stop="toggleWorkspaceColorPicker(wsIndex)"
                class="w-6 h-6 rounded border border-neutral-700 hover:border-neutral-600 transition-colors flex-shrink-0"
                :style="{ backgroundColor: workspace.color }"
                title="Change workspace color"
              />
              <!-- Color picker dropdown -->
              <div
                v-if="activeWorkspaceColorPicker === wsIndex"
                class="absolute z-20 top-8 left-0 bg-neutral-800 border border-neutral-700 rounded-lg p-2 grid grid-cols-5 gap-1 shadow-xl"
              >
                <button
                  v-for="color in colorOptions"
                  :key="color"
                  @click.stop="updateWorkspaceColor(wsIndex, color)"
                  class="w-7 h-7 rounded hover:scale-110 transition-transform"
                  :style="{ backgroundColor: color }"
                />
              </div>
            </div>

            <!-- Workspace Name -->
            <input
              v-model="workspace.name"
              type="text"
              placeholder="Workspace name"
              class="flex-1 px-3 py-1.5 bg-neutral-800 border border-neutral-700/50 rounded text-white placeholder-neutral-600 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 hover:border-neutral-600 transition-all"
              @input="debouncedSave"
            />
            <!-- Details Button -->
            <button
              @click="toggleWorkspaceDetails(wsIndex)"
              class="px-2 py-1 text-xs text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700/50 rounded transition-all flex-shrink-0"
              :title="expandedDetails.has(wsIndex) ? 'Hide details' : 'Show details'"
            >
              Details
            </button>

            <!-- Add Project Button -->
            <button
              @click="addProject(wsIndex)"
              class="px-2 py-1 text-xs text-neutral-200 bg-neutral-700/50 hover:text-white hover:bg-neutral-700 rounded transition-all flex items-center gap-1"
              title="Add project"
            >
              <Plus class="w-3 h-3" />
              Add Project ({{ workspace.projects.length }})
            </button>

            <!-- Remove Workspace Button -->
            <button
              @click="confirmRemoveWorkspace(wsIndex)"
              class="p-1.5 text-neutral-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-all flex-shrink-0"
              title="Remove workspace"
            >
              <X class="w-4 h-4" />
            </button>
          </div>
        </div>

        <!-- Workspace Details (collapsible) -->
        <div v-if="expandedDetails.has(wsIndex)" class="px-4 py-3 bg-neutral-800/30 border-b border-neutral-700 space-y-2">
          <input
            v-model="workspace.description"
            type="text"
            placeholder="Description (optional)"
            class="w-full px-3 py-1.5 bg-neutral-800 border border-neutral-700/50 rounded text-neutral-300 placeholder-neutral-600 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 hover:border-neutral-600 transition-all"
            @input="debouncedSave"
          />
          <div class="flex gap-2">
            <input
              v-model="workspace.directory"
              type="text"
              placeholder="Workspace directory (optional)"
              readonly
              class="flex-1 px-3 py-1.5 bg-neutral-900 border border-neutral-700/50 rounded text-neutral-400 placeholder-neutral-600 text-xs font-mono truncate cursor-not-allowed"
              :title="workspace.directory || 'No directory set'"
            />
            <button
              @click="selectWorkspaceDirectory(wsIndex)"
              class="px-2 py-1 bg-neutral-800 border border-neutral-700/50 rounded text-neutral-400 hover:text-neutral-200 hover:border-neutral-600 transition-all"
              title="Select directory"
            >
              <FolderOpen class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <!-- Projects List (collapsible) -->
        <div v-if="!collapsedWorkspaces.has(wsIndex)" class="p-3 space-y-3">
          <!-- Project Items -->
          <div
            v-for="(project, pIndex) in workspace.projects"
            :key="`project-${wsIndex}-${pIndex}`"
            class="border border-neutral-700/50 rounded-lg bg-neutral-800/20"
          >
            <!-- Project Header -->
            <div class="flex items-center gap-2 px-3 py-2 border-b border-neutral-700/30">
              <!-- Project Color Badge with Picker -->
              <div class="relative color-picker-container">
                <button
                  @click.stop="toggleProjectColorPicker(wsIndex, pIndex)"
                  class="w-5 h-5 rounded border border-neutral-700 hover:border-neutral-600 transition-colors flex-shrink-0"
                  :style="{ backgroundColor: project.color }"
                  title="Change project color"
                />
                <!-- Color picker dropdown -->
                <div
                  v-if="activeProjectColorPicker?.wsIndex === wsIndex && activeProjectColorPicker?.pIndex === pIndex"
                  class="absolute z-20 top-7 left-0 bg-neutral-800 border border-neutral-700 rounded-lg p-2 grid grid-cols-5 gap-1 shadow-xl"
                >
                  <button
                    v-for="color in colorOptions"
                    :key="color"
                    @click.stop="updateProjectColor(wsIndex, pIndex, color)"
                    class="w-7 h-7 rounded hover:scale-110 transition-transform"
                    :style="{ backgroundColor: color }"
                  />
                </div>
              </div>

              <!-- Project Name -->
              <input
                v-model="project.name"
                type="text"
                placeholder="Project name"
                class="flex-1 px-2 py-1 bg-neutral-800 border border-neutral-700/50 rounded text-white placeholder-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 hover:border-neutral-600 transition-all"
                @input="debouncedSave"
              />

              <!-- Add Directory Button -->
              <button
                @click="addDirectoryToProject(wsIndex, pIndex)"
                class="px-2 py-1 text-xs text-neutral-200 bg-neutral-700/50 hover:text-white hover:bg-neutral-700 rounded transition-all flex items-center gap-1"
                title="Add directory"
              >
                <Plus class="w-3 h-3" />
                Add Directory
              </button>

              <!-- Remove Project Button -->
              <button
                @click="confirmRemoveProject(wsIndex, pIndex)"
                class="p-1 text-neutral-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-all flex-shrink-0"
                title="Remove project"
              >
                <X class="w-3.5 h-3.5" />
              </button>
            </div>

            <!-- Directories List -->
            <div class="p-2 flex flex-wrap gap-2">
              <div
                v-for="(directory, dIndex) in (project.directories || [])"
                :key="`dir-${wsIndex}-${pIndex}-${dIndex}`"
                class="inline-flex items-center gap-1.5 px-2 py-1 bg-neutral-800/40 rounded text-xs"
              >
                <!-- Primary Badge -->
                <span
                  v-if="dIndex === 0"
                  class="px-1 py-0.5 bg-blue-500/20 text-blue-400 rounded text-xs font-medium"
                >
                  Primary
                </span>

                <!-- Directory Path -->
                <span
                  class="text-neutral-400 font-mono"
                  :title="directory"
                >
                  {{ getDirectoryName(directory) }}
                </span>

                <!-- Remove Directory Button -->
                <button
                  @click="confirmRemoveDirectory(wsIndex, pIndex, dIndex)"
                  class="p-0.5 text-neutral-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-all"
                  :title="dIndex === 0 && project.directories.length === 1 ? 'Cannot remove the only directory' : 'Remove directory'"
                  :disabled="dIndex === 0 && project.directories.length === 1"
                  :class="{ 'opacity-30 cursor-not-allowed': dIndex === 0 && project.directories.length === 1 }"
                >
                  <X class="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Add Workspace Button -->
      <button
        @click="addWorkspace"
        class="w-full px-4 py-2.5 bg-neutral-800 border border-neutral-700/50 rounded-lg text-neutral-300 hover:text-white hover:border-neutral-600 transition-all flex items-center justify-center gap-2"
      >
        <Plus class="w-4 h-4" />
        Add Workspace
      </button>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { Plus, X, FolderOpen } from 'lucide-vue-next'

interface WorkspaceProject {
  name: string
  directories: string[]  // First directory is primary
  color: string
}

interface Workspace {
  name: string
  description?: string
  directory?: string
  color: string
  projects: WorkspaceProject[]
}

interface WorkspacesSettings {
  workspaces: Workspace[]
}

interface Props {
  settings?: WorkspacesSettings
}

const props = withDefaults(defineProps<Props>(), {
  settings: undefined
})

const emit = defineEmits<{
  'update-setting': [{
    path: string[]
    value: any
  }]
}>()

// State - migrate old data format to new
const migrateWorkspaces = (workspaces: any[]): Workspace[] => {
  return workspaces.map(ws => ({
    ...ws,
    projects: ws.projects?.map((p: any) => ({
      ...p,
      // Migrate old directory field to directories array
      directories: p.directories || (p.directory ? [p.directory] : [])
    })) || []
  }))
}

const workspaces = ref<Workspace[]>(migrateWorkspaces(props.settings?.workspaces || []))
const collapsedWorkspaces = ref<Set<number>>(new Set())
const expandedDetails = ref<Set<number>>(new Set())

// Color picker state
const activeWorkspaceColorPicker = ref<number | null>(null)
const activeProjectColorPicker = ref<{ wsIndex: number; pIndex: number } | null>(null)

const colorOptions = [
  '#3B82F6', // blue
  '#10B981', // green
  '#F59E0B', // orange
  '#EF4444', // red
  '#A855F7', // purple
  '#6B7280', // gray
  '#14B8A6', // teal
  '#EC4899', // pink
  '#F97316', // orange-alt
  '#8B5CF6', // violet
  '#06B6D4', // cyan
  '#84CC16', // lime
]

// Debounce helper
let saveTimeout: number | undefined
const debouncedSave = () => {
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = window.setTimeout(() => {
    save()
  }, 500)
}

// Helper to get directory name from path
const getDirectoryName = (path: string) => {
  if (!path) return 'No directory'
  const parts = path.split('/').filter(Boolean)
  return parts[parts.length - 1] || path
}

// Workspace management
const addWorkspace = () => {
  const color = colorOptions[workspaces.value.length % colorOptions.length]
  workspaces.value.push({
    name: `Workspace ${workspaces.value.length + 1}`,
    color,
    projects: []
  })
  save()
}

const confirmRemoveWorkspace = (wsIndex: number) => {
  const workspace = workspaces.value[wsIndex]
  const hasProjects = workspace.projects.length > 0

  const message = hasProjects
    ? `Remove "${workspace.name}" and its ${workspace.projects.length} project(s)?`
    : `Remove "${workspace.name}"?`

  if (!confirm(message)) return

  workspaces.value.splice(wsIndex, 1)
  save()
}

const toggleWorkspaceCollapse = (wsIndex: number) => {
  if (collapsedWorkspaces.value.has(wsIndex)) {
    collapsedWorkspaces.value.delete(wsIndex)
  } else {
    collapsedWorkspaces.value.add(wsIndex)
  }
}

const toggleWorkspaceDetails = (wsIndex: number) => {
  if (expandedDetails.value.has(wsIndex)) {
    expandedDetails.value.delete(wsIndex)
  } else {
    expandedDetails.value.add(wsIndex)
  }
}

// Workspace color picker management
const toggleWorkspaceColorPicker = (wsIndex: number) => {
  activeWorkspaceColorPicker.value = activeWorkspaceColorPicker.value === wsIndex ? null : wsIndex
}

const updateWorkspaceColor = (wsIndex: number, color: string) => {
  workspaces.value[wsIndex].color = color
  activeWorkspaceColorPicker.value = null
  save()
}

// Project color picker management
const toggleProjectColorPicker = (wsIndex: number, pIndex: number) => {
  if (activeProjectColorPicker.value?.wsIndex === wsIndex && activeProjectColorPicker.value?.pIndex === pIndex) {
    activeProjectColorPicker.value = null
  } else {
    activeProjectColorPicker.value = { wsIndex, pIndex }
  }
}

const updateProjectColor = (wsIndex: number, pIndex: number, color: string) => {
  workspaces.value[wsIndex].projects[pIndex].color = color
  activeProjectColorPicker.value = null
  save()
}

const selectWorkspaceDirectory = async (wsIndex: number) => {
  if (!window.electronAPI?.fileUtils.selectDirectory) {
    console.error('Directory selection API not available')
    return
  }

  try {
    const directoryPath = await window.electronAPI.fileUtils.selectDirectory()
    if (!directoryPath) return

    workspaces.value[wsIndex].directory = directoryPath
    save()
  } catch (error) {
    console.error('Error selecting directory:', error)
  }
}

// Project management
const addProject = async (wsIndex: number) => {
  if (!window.electronAPI?.fileUtils.selectDirectory) {
    console.error('Directory selection API not available')
    return
  }

  try {
    const directoryPath = await window.electronAPI.fileUtils.selectDirectory()
    if (!directoryPath) return

    // Check for duplicates across all workspaces
    const allDirectories = workspaces.value.flatMap(ws =>
      ws.projects.flatMap(p => p.directories || [])
    )
    if (allDirectories.includes(directoryPath)) {
      alert('This directory is already added to a project')
      return
    }

    const name = directoryPath.split('/').filter(Boolean).pop() || 'Unnamed'
    const workspace = workspaces.value[wsIndex]
    const color = colorOptions[(workspace.projects.length + wsIndex) % colorOptions.length]

    workspace.projects.unshift({
      name,
      directories: [directoryPath],  // First directory is primary
      color
    })
    save()
  } catch (error) {
    console.error('Error adding project:', error)
  }
}

const confirmRemoveProject = (wsIndex: number, pIndex: number) => {
  const project = workspaces.value[wsIndex].projects[pIndex]

  if (!confirm(`Remove "${project.name}" and all its directories?`)) {
    return
  }

  workspaces.value[wsIndex].projects.splice(pIndex, 1)
  save()
}

// Directory management
const addDirectoryToProject = async (wsIndex: number, pIndex: number) => {
  if (!window.electronAPI?.fileUtils.selectDirectory) {
    console.error('Directory selection API not available')
    return
  }

  try {
    const directoryPath = await window.electronAPI.fileUtils.selectDirectory()
    if (!directoryPath) return

    // Check for duplicates
    const allDirectories = workspaces.value.flatMap(ws =>
      ws.projects.flatMap(p => p.directories || [])
    )
    if (allDirectories.includes(directoryPath)) {
      alert('This directory is already added to a project')
      return
    }

    const project = workspaces.value[wsIndex].projects[pIndex]
    // Ensure directories array exists
    if (!project.directories) {
      project.directories = []
    }
    project.directories.push(directoryPath)
    save()
  } catch (error) {
    console.error('Error adding directory:', error)
  }
}

const confirmRemoveDirectory = (wsIndex: number, pIndex: number, dIndex: number) => {
  const project = workspaces.value[wsIndex].projects[pIndex]

  // Ensure directories array exists
  if (!project.directories || project.directories.length === 0) {
    return
  }

  // Don't allow removing the only directory
  if (project.directories.length === 1) {
    return
  }

  workspaces.value[wsIndex].projects[pIndex].directories.splice(dIndex, 1)
  save()
}

// Save functions
const save = () => {
  emit('update-setting', {
    path: ['workspaces'],
    value: workspaces.value
  })
}

// Close color pickers when clicking outside
const handleClickOutside = (e: MouseEvent) => {
  const target = e.target as HTMLElement
  if (!target.closest('.color-picker-container')) {
    activeWorkspaceColorPicker.value = null
    activeProjectColorPicker.value = null
  }
}

onMounted(() => {
  window.addEventListener('click', handleClickOutside)
})

onBeforeUnmount(() => {
  window.removeEventListener('click', handleClickOutside)
})
</script>
