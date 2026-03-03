<script setup lang="ts">
import { ChevronRight, FolderPlus, Folder, Settings } from 'lucide-vue-next'
import { useProjectActions } from '../composables/useProjectActions'
import { MENU_ITEM_CLASS, MENU_SUB_CONTENT_CLASS, MENU_SEPARATOR_CLASS, MENU_DISABLED_CLASS } from '../constants'

const props = withDefaults(defineProps<{
  directoryPath: string
  showSeparator?: boolean
  // Component references for dynamic rendering
  ItemComponent: any
  SeparatorComponent: any
  SubComponent: any
  SubTriggerComponent: any
  SubContentComponent: any
  PortalComponent: any
  CheckboxItemComponent?: any
  ItemIndicatorComponent?: any
}>(), {
  showSeparator: true
})

const {
  projects,
  allProjects,
  isDirectoryInProject,
  toggleDirectoryInProject,
  createProject,
  navigateToProjects
} = useProjectActions()
</script>

<template>
  <!-- Separator -->
  <component v-if="showSeparator" :is="SeparatorComponent" :class="MENU_SEPARATOR_CLASS" />
  <!-- Add to Project submenu -->
  <component :is="SubComponent" v-if="allProjects.length > 0">
    <component :is="SubTriggerComponent" :class="MENU_ITEM_CLASS">
      <ChevronRight class="w-3 h-3" />
      <Folder class="w-4 h-4" />
      Add to Project
    </component>
    <component :is="PortalComponent">
      <component :is="SubContentComponent" :class="MENU_SUB_CONTENT_CLASS">
        <component
          :is="CheckboxItemComponent"
          v-for="({ project, pIndex }) in allProjects"
          :key="`${pIndex}`"
          :checked="isDirectoryInProject(project.directories, directoryPath)"
          @select="() => toggleDirectoryInProject(directoryPath, pIndex)"
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
            <span class="truncate">{{ project.name }}</span>
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

  <!-- Create Project -->
  <component
    :is="ItemComponent"
    @select="() => createProject(directoryPath)"
    :class="MENU_ITEM_CLASS"
  >
    <FolderPlus class="w-4 h-4" />
    Create Project
  </component>

  <!-- Manage Projects -->
  <component
    :is="ItemComponent"
    @select="navigateToProjects"
    :class="MENU_ITEM_CLASS"
  >
    <Settings class="w-4 h-4" />
    Manage Projects
  </component>
</template>
