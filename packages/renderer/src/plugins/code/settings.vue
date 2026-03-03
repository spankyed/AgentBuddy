<template>
  <div class="max-w-3xl">
    <!-- Default Base Directory Section -->
    <CollapsibleSection label="Default Base Directory" :default-open="true" class="mb-8">
      <p class="text-sm text-neutral-500 mb-4">
        Configure which project directory the code editor opens to on startup
      </p>
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <label class="text-sm font-medium text-neutral-200">
            Default Base Directory
          </label>
          <button
            @click="goToProjects"
            class="text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            Go to Projects →
          </button>
        </div>
        <DirectorySelect
          v-model="defaultBaseDirectory"
          :projects="projects"
          :disabled="getAllProjects().length === 0"
          @update:modelValue="saveDefaultDirectory"
        />
        <p class="text-xs text-neutral-600">
          {{ getAllProjects().length === 0
            ? 'Add projects in Settings → General → Projects to set a default directory'
            : 'If set, the code editor will always open to this project on startup'
          }}
        </p>
      </div>
    </CollapsibleSection>

    <!-- Terminal Settings Section -->
    <div class="border-t border-neutral-800 pt-8">
      <CollapsibleSection label="Terminal Settings" :default-open="true" class="mb-8">
      <p class="text-sm text-neutral-500 mb-4">
        Configure terminal behavior and preferences
      </p>
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <div class="flex-1">
            <label for="restore-terminals" class="text-sm font-medium text-neutral-200">
              Restore terminals on startup
            </label>
            <p class="mt-1 text-xs text-neutral-600">
              Automatically restore previously opened terminals when the application starts
            </p>
          </div>
          <input
            id="restore-terminals"
            v-model="restoreTerminals"
            type="checkbox"
            @change="saveTerminalSettings"
            class="w-4 h-4 text-blue-600 bg-neutral-800 border-neutral-600 rounded focus:ring-blue-500 focus:ring-2"
          />
        </div>

        <div class="flex items-center justify-between">
          <div class="flex-1">
            <label for="enable-shell-integration" class="text-sm font-medium text-neutral-200">
              Enable shell integration
            </label>
            <p class="mt-1 text-xs text-neutral-600">
              Track directory changes automatically (displays a brief setup command on terminal startup)
            </p>
          </div>
          <input
            id="enable-shell-integration"
            v-model="enableShellIntegration"
            type="checkbox"
            @change="saveShellIntegrationSetting"
            class="w-4 h-4 text-blue-600 bg-neutral-800 border-neutral-600 rounded focus:ring-blue-500 focus:ring-2"
          />
        </div>

        <div class="flex items-center justify-between">
          <div class="flex-1">
            <label for="confirm-terminal-close" class="text-sm font-medium text-neutral-200">
              Confirm before closing terminals
            </label>
            <p class="mt-1 text-xs text-neutral-600">
              Show a confirmation prompt when closing terminal tabs
            </p>
          </div>
          <input
            id="confirm-terminal-close"
            v-model="confirmTerminalClose"
            type="checkbox"
            @change="saveConfirmTerminalCloseSetting"
            class="w-4 h-4 text-blue-600 bg-neutral-800 border-neutral-600 rounded focus:ring-blue-500 focus:ring-2"
          />
        </div>

        <div class="flex items-center justify-between">
          <div class="flex-1">
            <label for="close-terminal-on-tab-close" class="text-sm font-medium text-neutral-200">
              Close terminal process when tab is closed
            </label>
            <p class="mt-1 text-xs text-neutral-600">
              Terminate the terminal process when closing a terminal tab
            </p>
          </div>
          <input
            id="close-terminal-on-tab-close"
            v-model="closeTerminalOnTabClose"
            type="checkbox"
            @change="saveCloseTerminalOnTabCloseSetting"
            class="w-4 h-4 text-blue-600 bg-neutral-800 border-neutral-600 rounded focus:ring-blue-500 focus:ring-2"
          />
        </div>
      </div>
    </CollapsibleSection>
    </div>

    <!-- Code Hotkeys Section -->
    <div class="border-t border-neutral-800 pt-8">
      <CollapsibleSection label="Code Hotkeys" :default-open="true" class="mb-8">
        <p class="text-sm text-neutral-500 mb-4">
          Keyboard shortcuts available when the code plugin is active
        </p>
        <div class="space-y-6">
          <div class="group">
            <KeyboardShortcutInput
              v-model="hotkeys.openTerminal"
              id="open-terminal"
              label="Open Terminal"
              @change="saveHotkeys"
              container-class="flex-1"
              :show-reset-button="true"
            />
            <p class="mt-1.5 text-xs text-neutral-600">
              Open a new terminal in the current working directory
            </p>
          </div>

          <div class="group">
            <KeyboardShortcutInput
              v-model="hotkeys.focusSearch"
              id="focus-search"
              label="Focus Search"
              @change="saveHotkeys"
              container-class="flex-1"
              :show-reset-button="true"
            />
            <p class="mt-1.5 text-xs text-neutral-600">
              Open the search panel and focus the search input
            </p>
          </div>

          <div class="group">
            <div class="flex gap-4">
              <KeyboardShortcutInput
                v-model="hotkeys.navigatePrevPanel"
                id="navigate-prev-panel"
                label="Previous Panel"
                @change="saveHotkeys"
                container-class="flex-1"
                :show-reset-button="true"
              />

              <KeyboardShortcutInput
                v-model="hotkeys.navigateNextPanel"
                id="navigate-next-panel"
                label="Next Panel"
                @change="saveHotkeys"
                container-class="flex-1"
                :show-reset-button="true"
              />
            </div>

            <p class="mt-2 text-xs text-neutral-600">
              Navigate between panels in the code view
            </p>
          </div>
        </div>
      </CollapsibleSection>
    </div>

    <!-- Save status will be managed by parent -->
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, computed } from 'vue'
import { useSelector } from '@xstate/vue'
import KeyboardShortcutInput from '@/core/components/design/KeyboardShortcutInput.vue'
import CollapsibleSection from '@/core/components/design/CollapsibleSection.vue'
import DirectorySelect from '@/core/components/design/DirectorySelect.vue'
import { X } from 'lucide-vue-next'
import { applicationState } from '@/main'
import { trpc } from '@/core/trpc'
import type { CodeSettings } from '@app/api'

interface Project {
  name: string
  directories: string[]  // First directory is primary
  color: string
}

interface Props {
  settings?: CodeSettings
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

// State - initialize directly from props with defaults
const hotkeys = reactive<CodeSettings['hotkeys']>({
  openTerminal: props.settings?.hotkeys?.openTerminal || null,
  navigatePrevPanel: props.settings?.hotkeys?.navigatePrevPanel || null,
  navigateNextPanel: props.settings?.hotkeys?.navigateNextPanel || null,
  focusSearch: props.settings?.hotkeys?.focusSearch || null
})

const restoreTerminals = ref(props.settings?.restoreTerminals ?? true)
const enableShellIntegration = ref(props.settings?.enableShellIntegration ?? true)
const confirmTerminalClose = ref(props.settings?.confirmTerminalClose ?? true)
const closeTerminalOnTabClose = ref(props.settings?.closeTerminalOnTabClose ?? true)
const defaultBaseDirectory = ref<string | null>(props.settings?.defaultBaseDirectory || null)

// Get projects from general settings
const settingsActor = applicationState.system.get('settings')
const projects = computed(() => {
  return (useSelector(settingsActor, (state: any) => state.context.settings?.general?.projects).value || []) as Project[]
})

// Helper functions
const getAllProjects = (): Project[] => {
  return projects.value
}

// Save functions
const saveHotkeys = () => {
  // Simply send all hotkeys as-is
  emit('update-setting', {
    path: ['hotkeys'],
    value: hotkeys
  })
}

const saveTerminalSettings = () => {
  emit('update-setting', {
    path: ['restoreTerminals'],
    value: restoreTerminals.value
  })
}

const saveShellIntegrationSetting = () => {
  emit('update-setting', {
    path: ['enableShellIntegration'],
    value: enableShellIntegration.value
  })
}

const saveConfirmTerminalCloseSetting = () => {
  emit('update-setting', {
    path: ['confirmTerminalClose'],
    value: confirmTerminalClose.value
  })
}

const saveCloseTerminalOnTabCloseSetting = () => {
  emit('update-setting', {
    path: ['closeTerminalOnTabClose'],
    value: closeTerminalOnTabClose.value
  })
}

const saveDefaultDirectory = () => {
  emit('update-setting', {
    path: ['defaultBaseDirectory'],
    value: defaultBaseDirectory.value
  })
}

const goToProjects = () => {
  // Navigate to settings plugin
  applicationState.send({ type: 'SELECT_PLUGIN', pluginId: 'settings' })

  // Switch to general tab and navigate to projects
  settingsActor?.send({ type: 'TAB.SELECT', tab: 'general' })
  settingsActor?.send({ type: 'GENERAL_NAV.SELECT', item: 'projects' })
}
</script>
