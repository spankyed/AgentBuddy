<template>
  <div class="max-w-4xl">
    <p class="text-sm text-neutral-500 mb-6">
      Manage your projects. Each project can contain multiple directories.
    </p>

    <div class="space-y-3">
      <!-- Project Cards -->
      <div
        v-for="(project, pIndex) in projects"
        :key="`project-${pIndex}`"
        class="border border-neutral-700/50 rounded-lg bg-neutral-900"
      >
        <!-- Project Header -->
        <div class="flex items-center gap-2 px-3 py-2 border-b border-neutral-700/30">
          <!-- Project Color Badge with Picker -->
          <div class="relative color-picker-container">
            <button
              @click.stop="toggleProjectColorPicker(pIndex)"
              class="w-5 h-5 rounded border border-neutral-700 hover:border-neutral-600 transition-colors flex-shrink-0"
              :style="{ backgroundColor: project.color }"
              title="Change project color"
            />
            <!-- Color picker dropdown -->
            <div
              v-if="activeProjectColorPicker === pIndex"
              class="absolute z-20 top-7 left-0 bg-neutral-800 border border-neutral-700 rounded-lg p-2 grid grid-cols-5 gap-1 shadow-xl"
            >
              <button
                v-for="color in colorOptions"
                :key="color"
                @click.stop="updateProjectColor(pIndex, color)"
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
            @click="addDirectoryToProject(pIndex)"
            class="px-2 py-1 text-xs text-neutral-200 bg-neutral-700/50 hover:text-white hover:bg-neutral-700 rounded transition-all flex items-center gap-1"
            title="Add directory"
          >
            <Plus class="w-3 h-3" />
            Add Directory
          </button>

          <!-- Remove Project Button -->
          <button
            @click="confirmRemoveProject(pIndex)"
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
            :key="`dir-${pIndex}-${dIndex}`"
            :class="[
              'inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs',
              dIndex === 0
                ? 'bg-neutral-800/80 border border-neutral-700/50'
                : 'bg-neutral-800/40'
            ]"
            :style="dIndex === 0 ? { borderLeftColor: project.color, borderLeftWidth: '2px' } : {}"
          >

            <!-- Directory Path -->
            <span
              class="text-neutral-400 font-mono"
              :title="directory"
            >
              {{ getDirectoryName(directory) }}
            </span>

            <!-- Remove Directory Button -->
            <button
              @click="confirmRemoveDirectory(pIndex, dIndex)"
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

      <!-- Add Project Button -->
      <button
        @click="addProject"
        class="flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors border-2 border-dashed rounded-md border-neutral-700 text-neutral-400 hover:border-neutral-600 hover:text-neutral-300"
      >
        <Plus class="w-3.5 h-3.5" />
        Add Project
      </button>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { Plus, X } from 'lucide-vue-next'

interface Project {
  name: string
  directories: string[]
  color: string
}

interface Props {
  settings?: Project[]
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

// Migration: handle both old wrapper format and new flat format
const migrateData = (settings: any): Project[] => {
  // New format: settings is directly an array of Project
  if (Array.isArray(settings)) {
    return settings
  }
  // Old format: settings is a wrapper with .projects array
  if (Array.isArray(settings?.projects)) {
    return settings.projects
  }
  return []
}

const projects = ref<Project[]>(migrateData(props.settings))

// Color picker state
const activeProjectColorPicker = ref<number | null>(null)

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
  return parts.slice(-2).join('/') || path
}

// Project management
const addProject = async () => {
  if (!window.electronAPI?.fileUtils.selectDirectory) {
    console.error('Directory selection API not available')
    return
  }

  try {
    const directoryPath = await window.electronAPI.fileUtils.selectDirectory()
    if (!directoryPath) return

    // Check for duplicates
    const allDirectories = projects.value.flatMap(p => p.directories || [])
    if (allDirectories.includes(directoryPath)) {
      alert('This directory is already added to a project')
      return
    }

    const name = directoryPath.split('/').filter(Boolean).pop() || 'Unnamed'
    const color = colorOptions[projects.value.length % colorOptions.length]

    projects.value.unshift({
      name,
      directories: [directoryPath],
      color
    })
    save()
  } catch (error) {
    console.error('Error adding project:', error)
  }
}

const confirmRemoveProject = (pIndex: number) => {
  const project = projects.value[pIndex]

  if (!confirm(`Remove "${project.name}" and all its directories?`)) {
    return
  }

  projects.value.splice(pIndex, 1)
  save()
}

// Project color picker management
const toggleProjectColorPicker = (pIndex: number) => {
  activeProjectColorPicker.value = activeProjectColorPicker.value === pIndex ? null : pIndex
}

const updateProjectColor = (pIndex: number, color: string) => {
  projects.value[pIndex].color = color
  activeProjectColorPicker.value = null
  save()
}

// Directory management
const addDirectoryToProject = async (pIndex: number) => {
  if (!window.electronAPI?.fileUtils.selectDirectory) {
    console.error('Directory selection API not available')
    return
  }

  try {
    const directoryPath = await window.electronAPI.fileUtils.selectDirectory()
    if (!directoryPath) return

    // Check for duplicates
    const allDirectories = projects.value.flatMap(p => p.directories || [])
    if (allDirectories.includes(directoryPath)) {
      alert('This directory is already added to a project')
      return
    }

    const project = projects.value[pIndex]
    if (!project.directories) {
      project.directories = []
    }
    project.directories.push(directoryPath)
    save()
  } catch (error) {
    console.error('Error adding directory:', error)
  }
}

const confirmRemoveDirectory = (pIndex: number, dIndex: number) => {
  const project = projects.value[pIndex]

  if (!project.directories || project.directories.length === 0) {
    return
  }

  // Don't allow removing the only directory
  if (project.directories.length === 1) {
    return
  }

  projects.value[pIndex].directories.splice(dIndex, 1)
  save()
}

// Save functions
const save = () => {
  emit('update-setting', {
    path: [],
    value: projects.value
  })
}

// Close color pickers when clicking outside
const handleClickOutside = (e: MouseEvent) => {
  const target = e.target as HTMLElement
  if (!target.closest('.color-picker-container')) {
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
