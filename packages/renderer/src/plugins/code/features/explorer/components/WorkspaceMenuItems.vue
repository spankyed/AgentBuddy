<script setup lang="ts">
import { ChevronLeft, FolderPlus, Folder, Settings } from 'lucide-vue-next'
import { useWorkspaceActions } from '../composables/useWorkspaceActions'
import { MENU_ITEM_CLASS, MENU_SUB_CONTENT_CLASS, MENU_SEPARATOR_CLASS, MENU_DISABLED_CLASS } from '../constants'

const props = defineProps<{
  directoryPath: string
  // Component references for dynamic rendering
  ItemComponent: any
  SeparatorComponent: any
  SubComponent: any
  SubTriggerComponent: any
  SubContentComponent: any
  PortalComponent: any
  CheckboxItemComponent?: any
  ItemIndicatorComponent?: any
}>()

const {
  workspaces,
  allProjects,
  isDirectoryInProject,
  toggleDirectoryInProject,
  createWorkspaceProject,
  navigateToWorkspaces
} = useWorkspaceActions()
</script>

<template>
  <!-- Separator -->
  <component :is="SeparatorComponent" :class="MENU_SEPARATOR_CLASS" />
  <!-- Add to Workspace Project submenu -->
  <component :is="SubComponent" v-if="allProjects.length > 0">
    <component :is="SubTriggerComponent" :class="MENU_ITEM_CLASS">
      <ChevronLeft class="w-3 h-3" />
      <Folder class="w-4 h-4" />
      Add Project Directory
    </component>
    <component :is="PortalComponent">
      <component :is="SubContentComponent" :class="MENU_SUB_CONTENT_CLASS">
        <component
          :is="CheckboxItemComponent"
          v-for="({ workspace, project, wsIndex, pIndex }) in allProjects"
          :key="`${wsIndex}-${pIndex}`"
          :checked="isDirectoryInProject(project.directories, directoryPath)"
          @select="() => toggleDirectoryInProject(directoryPath, wsIndex, pIndex)"
          :class="MENU_ITEM_CLASS"
        >
          <component :is="ItemIndicatorComponent" class="flex items-center justify-center w-4 h-4">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
            </svg>
          </component>
          <div class="flex items-center gap-2">
            <span
              class="w-2 h-2 rounded-full flex-shrink-0"
              :style="{ backgroundColor: project.color }"
            ></span>
            <span class="truncate">{{ project.name }} ‹ {{ workspace.name }} </span>
          </div>
        </component>
      </component>
    </component>
  </component>

  <!-- Show message when no projects -->
  <component
    :is="ItemComponent"
    v-else
    disabled
    :class="MENU_DISABLED_CLASS"
  >
    No projects available
  </component>

  <!-- Create Workspace Project submenu -->
  <component :is="SubComponent" v-if="workspaces.length > 0">
    <component :is="SubTriggerComponent" :class="MENU_ITEM_CLASS">
      <div class="flex items-center gap-2">
        <ChevronLeft class="w-3 h-3" />
        <FolderPlus class="w-4 h-4" />
        Create Workspace Project
      </div>
    </component>
    <component :is="PortalComponent">
      <component :is="SubContentComponent" :class="MENU_SUB_CONTENT_CLASS">
        <!-- Existing workspaces -->
        <component
          :is="ItemComponent"
          v-for="(workspace, wsIndex) in workspaces"
          :key="`ws-${wsIndex}`"
          @select="() => createWorkspaceProject(directoryPath, wsIndex)"
          :class="MENU_ITEM_CLASS"
        >
          <span
            class="w-2 h-2 rounded-full flex-shrink-0"
            :style="{ backgroundColor: workspace.color }"
          ></span>
          <span class="truncate">{{ workspace.name }}</span>
        </component>

        <component :is="SeparatorComponent" :class="MENU_SEPARATOR_CLASS" />

        <!-- Manage Workspaces option -->
        <component
          :is="ItemComponent"
          @select="navigateToWorkspaces"
          :class="MENU_ITEM_CLASS"
        >
          <Settings class="w-4 h-4" />
          Manage Workspaces
        </component>
      </component>
    </component>
  </component>

  <!-- No workspaces - navigate to manage -->
  <component
    :is="ItemComponent"
    v-else
    @select="navigateToWorkspaces"
    :class="MENU_ITEM_CLASS"
  >
    <Settings class="w-4 h-4" />
    Manage Workspaces
  </component>
</template>
