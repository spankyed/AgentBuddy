<template>
  <div class="p-2 border-b border-neutral-800">
    <div class="flex items-center gap-1 overflow-x-auto text-xs whitespace-nowrap">
      <span
        v-for="(segment, index) in segments"
        :key="index"
        class="flex items-center flex-shrink-0"
      >
        <!-- Ellipsis segment with dropdown -->
        <DropdownMenuRoot v-if="segment.isEllipsis">
          <DropdownMenuTrigger as-child>
            <button
              class="px-2 py-1 transition-all rounded hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200"
              title="Hidden directories"
            >
              {{ segment.name }}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuPortal>
            <DropdownMenuContent
              class="min-w-[160px] bg-neutral-900 border border-neutral-700 rounded-md shadow-lg py-1 z-50"
              :side-offset="5"
            >
              <DropdownMenuItem
                v-for="hidden in segment.hiddenSegments"
                :key="hidden.path"
                @select="() => $emit('navigate', hidden.path)"
                class="px-3 py-2 text-sm transition-colors cursor-pointer text-neutral-200 hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none"
              >
                {{ hidden.name }}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenuPortal>
        </DropdownMenuRoot>

        <!-- Regular segment with context menu -->
        <ContextMenuRoot v-else>
          <ContextMenuTrigger as-child>
            <button
              @click="$emit('navigate', segment.path)"
              class="px-2 py-1 transition-all rounded hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200"
              :class="{
                'font-medium text-neutral-200': segment.path === activeDirectory
              }"
              :title="segment.path"
            >
              {{ segment.name }}
            </button>
          </ContextMenuTrigger>
          <ContextMenuPortal>
            <ContextMenuContent
              class="min-w-[160px] bg-neutral-900 border border-neutral-700 rounded-md shadow-lg py-1 z-50"
            >
              <!-- Set as Base Directory - only show if not already base -->
              <ContextMenuItem
                v-if="segment.path !== baseDirectory"
                @select="() => $emit('set-base', segment.path)"
                class="px-3 py-2 text-sm transition-colors cursor-pointer text-neutral-200 hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none"
              >
                Set as Base Directory
              </ContextMenuItem>

              <!-- Add to Workspace Project submenu -->
              <ContextMenuSub v-if="allProjects.length > 0">
                <ContextMenuSubTrigger class="flex items-center gap-2 px-3 py-2 text-sm transition-colors cursor-pointer text-neutral-200 hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none">
                  <ChevronLeft class="w-3 h-3" />
                  <Folder class="w-4 h-4" />
                  Add Project Directory
                </ContextMenuSubTrigger>
                <ContextMenuPortal>
                  <ContextMenuSubContent class="min-w-[200px] bg-neutral-900 border border-neutral-700 rounded-md shadow-lg py-1 z-50">
                    <ContextMenuCheckboxItem
                      v-for="({ workspace, project, wsIndex, pIndex }) in allProjects"
                      :key="`${wsIndex}-${pIndex}`"
                      :checked="isDirectoryInProject(project.directories, segment.path)"
                      @select="() => toggleDirectoryInProject(segment.path, wsIndex, pIndex)"
                      class="flex items-center gap-2 px-3 py-2 text-sm transition-colors cursor-pointer text-neutral-200 hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none"
                    >
                      <ContextMenuItemIndicator class="flex items-center justify-center w-4 h-4">
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                        </svg>
                      </ContextMenuItemIndicator>
                      <div class="flex items-center gap-2">
                        <span
                          class="w-2 h-2 rounded-full flex-shrink-0"
                          :style="{ backgroundColor: project.color }"
                        ></span>
                        <span class="truncate">{{ project.name }} ‹ {{ workspace.name }} </span>
                      </div>
                    </ContextMenuCheckboxItem>
                  </ContextMenuSubContent>
                </ContextMenuPortal>
              </ContextMenuSub>

              <!-- Show message when no projects -->
              <ContextMenuItem
                v-else
                disabled
                class="px-3 py-2 text-sm text-neutral-500"
              >
                No projects available
              </ContextMenuItem>

              <!-- Separator -->
              <ContextMenuSeparator class="h-px my-1 bg-neutral-700" />

              <!-- Create Workspace Project -->
              <ContextMenuSub v-if="workspaces.length > 0">
                <ContextMenuSubTrigger class="flex items-center justify-between gap-2 px-3 py-2 text-sm transition-colors cursor-pointer text-neutral-200 hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none">
                  <div class="flex items-center gap-2">
                    <ChevronLeft class="w-3 h-3" />
                    <FolderPlus class="w-4 h-4" />
                    Create Workspace Project
                  </div>
                </ContextMenuSubTrigger>
                <ContextMenuPortal>
                  <ContextMenuSubContent class="min-w-[200px] bg-neutral-900 border border-neutral-700 rounded-md shadow-lg py-1 z-50">
                    <!-- Existing workspaces -->
                    <ContextMenuItem
                      v-for="(workspace, wsIndex) in workspaces"
                      :key="`ws-${wsIndex}`"
                      @select="() => createWorkspaceProject(segment.path, wsIndex)"
                      class="flex items-center gap-2 px-3 py-2 text-sm transition-colors cursor-pointer text-neutral-200 hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none"
                    >
                      <span
                        class="w-2 h-2 rounded-full flex-shrink-0"
                        :style="{ backgroundColor: workspace.color }"
                      ></span>
                      <span class="truncate">{{ workspace.name }}</span>
                    </ContextMenuItem>

                    <ContextMenuSeparator class="h-px my-1 bg-neutral-700" />

                    <!-- Manage Workspaces option -->
                    <ContextMenuItem
                      @select="navigateToWorkspaces"
                      class="flex items-center gap-2 px-3 py-2 text-sm transition-colors cursor-pointer text-neutral-200 hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none"
                    >
                      <Settings class="w-4 h-4" />
                      Manage Workspaces
                    </ContextMenuItem>
                  </ContextMenuSubContent>
                </ContextMenuPortal>
              </ContextMenuSub>

              <!-- No workspaces - navigate to manage -->
              <ContextMenuItem
                v-else
                @select="navigateToWorkspaces"
                class="flex items-center gap-2 px-3 py-2 text-sm transition-colors cursor-pointer text-neutral-200 hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none"
              >
                <Settings class="w-4 h-4" />
                Manage Workspaces
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenuPortal>
        </ContextMenuRoot>

        <span v-if="index < segments.length - 1" class="text-neutral-600 mx-0.5">/</span>
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSelector } from '@xstate/vue'
import { applicationState } from '@/main'
import { ChevronLeft, FolderPlus, Folder, Settings } from 'lucide-vue-next'
import {
  DropdownMenuRoot,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  ContextMenuRoot,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuPortal,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
  ContextMenuCheckboxItem,
  ContextMenuItemIndicator,
  ContextMenuSeparator,
} from 'reka-ui'

interface BreadcrumbSegment {
  name: string
  path: string
  isEllipsis?: boolean
  hiddenSegments?: Array<{ name: string; path: string }>
}

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
  baseDirectory: string | null
  activeDirectory: string | null
}>()

defineEmits<{
  'navigate': [path: string]
  'set-base': [path: string]
}>()

// Access settings for workspaces
const settingsActor = applicationState.system.get('settings')
const workspaces = useSelector(settingsActor, (state: any) =>
  state.context.settings?.general?.workspaces?.workspaces || []
)

// Helper to check if a directory is in a project
const isDirectoryInProject = (projectDirectories: string[], directoryPath: string) => {
  return projectDirectories.includes(directoryPath)
}

// Helper to get all projects across all workspaces
const allProjects = computed(() => {
  const projects: Array<{ workspace: Workspace; project: WorkspaceProject; wsIndex: number; pIndex: number }> = []
  workspaces.value.forEach((ws: Workspace, wsIndex: number) => {
    ws.projects.forEach((project: WorkspaceProject, pIndex: number) => {
      projects.push({ workspace: ws, project, wsIndex, pIndex })
    })
  })
  return projects
})

// Toggle directory in project
const toggleDirectoryInProject = (segmentPath: string, wsIndex: number, pIndex: number) => {
  const updatedWorkspaces = JSON.parse(JSON.stringify(workspaces.value)) as Workspace[]
  const project = updatedWorkspaces[wsIndex].projects[pIndex]

  const dirIndex = project.directories.indexOf(segmentPath)
  if (dirIndex > -1) {
    // Remove directory
    project.directories.splice(dirIndex, 1)
  } else {
    // Add directory
    project.directories.push(segmentPath)
  }

  // Update settings
  settingsActor?.send({
    type: 'SETTINGS.UPDATE',
    entityType: 'general',
    label: 'workspaces',
    path: ['workspaces'],
    value: updatedWorkspaces
  })
}

// Create new workspace project with directory
const createWorkspaceProject = (directoryPath: string, wsIndex: number) => {
  const updatedWorkspaces = JSON.parse(JSON.stringify(workspaces.value)) as Workspace[]

  // Extract folder name from path
  const folderName = directoryPath.split('/').filter(Boolean).pop() || 'New Project'

  // Available colors for projects
  const projectColors = ['#3b82f6', '#8b5cf6', '#ec4899', '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6']
  const randomColor = projectColors[Math.floor(Math.random() * projectColors.length)]

  // Create new project
  const newProject: WorkspaceProject = {
    name: folderName,
    directories: [directoryPath],
    color: randomColor
  }

  // Add to existing workspace
  updatedWorkspaces[wsIndex].projects.push(newProject)

  // Update settings
  settingsActor?.send({
    type: 'SETTINGS.UPDATE',
    entityType: 'general',
    label: 'workspaces',
    path: ['workspaces'],
    value: updatedWorkspaces
  })
}

// Navigate to workspaces settings
const navigateToWorkspaces = () => {
  // Switch to settings plugin
  applicationState.send({
    type: 'SELECT_PLUGIN',
    pluginId: 'settings'
  })

  // Navigate to General tab
  settingsActor?.send({
    type: 'SETTINGS_TAB.SELECT',
    tab: 'general'
  })

  // Navigate to workspaces section
  settingsActor?.send({
    type: 'GENERAL_NAV.SELECT',
    item: 'workspaces'
  })
}

const segments = computed<BreadcrumbSegment[]>(() => {
  const base = props.baseDirectory
  const current = props.activeDirectory

  if (!base || !current) return []

  const normalizedBase = base.endsWith('/') && base.length > 1
    ? base.slice(0, -1)
    : base
  const normalizedCurrent = current.endsWith('/') && current.length > 1
    ? current.slice(0, -1)
    : current

  const allSegments: Array<{ name: string; path: string }> = []

  const baseName = normalizedBase.split('/').filter(Boolean).pop() || '/'

  if (normalizedCurrent.startsWith(normalizedBase)) {
    allSegments.push({ name: `~/${baseName}`, path: normalizedBase })

    const relativePath = normalizedCurrent.slice(normalizedBase.length)
    if (relativePath) {
      const segments = relativePath.split('/').filter(Boolean)
      let currentPath = normalizedBase

      segments.forEach(segment => {
        currentPath = currentPath + '/' + segment
        allSegments.push({ name: segment, path: currentPath })
      })
    }
  } else {
    allSegments.push({ name: '/', path: '/' })
    const segments = normalizedCurrent.slice(1).split('/').filter(Boolean)
    let currentPath = ''

    segments.forEach(segment => {
      currentPath = currentPath + '/' + segment
      allSegments.push({ name: segment, path: currentPath })
    })
  }

  // Apply truncation if needed
  const maxVisibleSegments = 5
  if (allSegments.length <= maxVisibleSegments) {
    return allSegments
  }

  // Keep first 2 and last 2, put ellipsis in middle
  const result: BreadcrumbSegment[] = []
  const firstSegments = allSegments.slice(0, 2)
  const lastSegments = allSegments.slice(-2)
  const hiddenSegments = allSegments.slice(2, -2)

  result.push(...firstSegments)
  result.push({
    name: '...',
    path: hiddenSegments[hiddenSegments.length - 1].path,
    isEllipsis: true,
    hiddenSegments: hiddenSegments
  })
  result.push(...lastSegments)

  return result
})
</script>
