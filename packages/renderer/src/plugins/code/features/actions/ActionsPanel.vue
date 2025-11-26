<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="flex items-center justify-between px-4 pt-3 pb-3 border-b border-neutral-800 actions-header">
      <div class="flex items-center gap-2">
        <Play :size="16" class="text-neutral-400" />
        <h3 class="text-sm font-medium text-neutral-200">Actions</h3>
      </div>
      <div class="flex items-center gap-1">
        <button
          @click="goToCreateAction"
          class="p-0 transition-colors rounded text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
          title="Create new action"
        >
          <Plus :size="16" />
        </button>
        <!-- <button
          @click="refreshActions"
          :disabled="isLoading"
          class="p-1 transition-colors rounded text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
          title="Refresh actions"
        >
          <RefreshCw :size="16" :class="{ 'animate-spin': isLoading }" />
        </button> -->
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading && actions.length === 0" class="flex items-center justify-center flex-1">
      <div class="text-sm text-neutral-400">Loading actions...</div>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="p-4 m-2 border rounded bg-red-500/10 border-red-500/50">
      <div class="text-sm text-red-400">{{ error }}</div>
    </div>

    <!-- Actions List -->
    <div v-else class="flex-1 overflow-auto">
      <div v-if="actions.length === 0" class="p-4 text-sm text-center text-neutral-400">
        No actions found
      </div>

      <ContextMenuRoot v-for="action in actions" :key="action.id">
        <ContextMenuTrigger as-child>
          <div
            @click="selectAction(action)"
            class="px-4 py-3 transition-colors border-b cursor-pointer border-neutral-800 hover:bg-neutral-800/50"
          >
            <div class="flex items-start justify-between">
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium truncate text-neutral-200" :title="action.description">
                  {{ action.label }}
                </div>
                <div class="mt-1 space-y-1">
                  <!-- Input Parameters -->
                  <div v-if="action.input && Object.keys(action.input).length > 0" class="flex flex-wrap gap-1">
                    <span
                      v-for="(param, key) in action.input"
                      :key="key"
                      @click.stop="startEditParameter(action.id, String(key))"
                      class="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded bg-neutral-800 text-neutral-400 cursor-pointer hover:bg-neutral-700 transition-colors"
                    >
                      <template v-if="editingParameter?.actionId === action.id && editingParameter?.key === String(key)">
                        <input
                          v-model="editedParameterName"
                          :data-edit-param="`${action.id}-${key}`"
                          @keydown.enter.stop="confirmEditParameter(action)"
                          @keydown.escape.stop="cancelEditParameter"
                          @blur="confirmEditParameter(action)"
                          @click.stop
                          class="w-16 px-1 text-xs bg-transparent border-b border-blue-500 focus:outline-none text-neutral-200"
                        />
                      </template>
                      <template v-else>
                        <span class="font-medium">{{ key }}</span>
                        <span class="text-neutral-500">({{ param.type }})</span>
                        <span v-if="param.required" class="text-red-400">*</span>
                      </template>
                    </span>
                  </div>
                  <div v-else-if="addingParameterForAction !== action.id" class="text-xs italic text-neutral-500">
                    No parameters
                  </div>

                  <!-- Add Parameter Input -->
                  <div v-if="addingParameterForAction === action.id" class="mt-1">
                    <input
                      v-model="newParameterName"
                      :data-add-param="action.id"
                      @keydown.enter.stop="confirmAddParameter(action)"
                      @keydown.escape.stop="cancelAddParameter"
                      @blur="confirmAddParameter(action)"
                      @click.stop
                      class="w-full px-2 py-1 text-xs rounded bg-neutral-800 border border-blue-500 text-neutral-200 focus:outline-none"
                      placeholder="Parameter name"
                    />
                  </div>
                </div>
              </div>

              <!-- Right side controls -->
              <div class="flex items-center gap-2 ml-3">
                <!-- Category Tag -->
                <div v-if="action.category">
                  <span class="inline-flex items-center px-2 py-0.5 text-[10px] font-medium rounded bg-neutral-700 text-neutral-300">
                    {{ action.category }}
                  </span>
                </div>

                <!-- External Link Button -->
                <button
                  @click.stop="goToAction(action)"
                  class="p-1 transition-colors rounded text-neutral-500 hover:text-neutral-200 hover:bg-neutral-700"
                  title="Go to action"
                >
                  <ExternalLink :size="16" />
                </button>
              </div>
            </div>
          </div>
        </ContextMenuTrigger>

        <ContextMenuPortal>
          <ContextMenuContent :class="MENU_CONTENT_CLASS">
            <ContextMenuItem @select="startAddParameter(action)" :class="MENU_ITEM_CLASS">
              <Plus :size="16" />
              Add Parameter
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenuPortal>
      </ContextMenuRoot>
    </div>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="flex items-center justify-center gap-2 p-3 border-t border-neutral-800">
      <button
        @click="goToPage(page - 1)"
        :disabled="page === 1 || isLoading"
        class="px-2 py-1 text-xs transition-colors rounded"
        :class="page === 1 || isLoading ? 'text-neutral-600 cursor-not-allowed' : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'"
      >
        Previous
      </button>

      <span class="text-xs text-neutral-400">
        Page {{ page }} of {{ totalPages }}
      </span>

      <button
        @click="goToPage(page + 1)"
        :disabled="page === totalPages || isLoading"
        class="px-2 py-1 text-xs transition-colors rounded"
        :class="page === totalPages || isLoading ? 'text-neutral-600 cursor-not-allowed' : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'"
      >
        Next
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue'
import { useSelector } from '@xstate/vue'
import { applicationState } from '@/main'
import { id as codeId, type CodeState } from '@/plugins/code/state'
import { id as actionsPluginId } from '@/plugins/actions/state'
import { RefreshCw, Play, ExternalLink, Plus } from 'lucide-vue-next'
import type { ActionEntity, ActionParameter } from '@app/api'
import {
  ContextMenuRoot,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuPortal,
} from 'reka-ui'
import { MENU_CONTENT_CLASS, MENU_ITEM_CLASS } from '../explorer/constants'

// Get actors - use main actions plugin for state, codeActions for tab management
const codeActor: CodeState = applicationState.system.get(codeId)
const codeActionsActor = codeActor.system.get('codeActions')!
const actionsPluginActor = applicationState.system.get(actionsPluginId)!

// State selectors - read from main actions plugin (single source of truth)
const actions = useSelector(actionsPluginActor, (state: any) => state.context.actions)
const page = useSelector(actionsPluginActor, (state: any) => state.context.page)
const totalPages = useSelector(actionsPluginActor, (state: any) => state.context.totalPages)
const totalCount = useSelector(actionsPluginActor, (state: any) => state.context.totalCount)
const isLoading = ref(false)
const error = ref<string | null>(null)

// State for adding/editing parameters
const addingParameterForAction = ref<string | null>(null)
const newParameterName = ref('')
const editingParameter = ref<{ actionId: string, key: string } | null>(null)
const editedParameterName = ref('')

function startAddParameter(action: ActionEntity) {
  addingParameterForAction.value = action.id
  newParameterName.value = ''
  nextTick(() => {
    const input = document.querySelector(`[data-add-param="${action.id}"]`) as HTMLInputElement
    input?.focus()
  })
}

function confirmAddParameter(action: ActionEntity) {
  if (newParameterName.value.trim()) {
    const paramKey = newParameterName.value.trim()
    const updatedInput = {
      ...action.input,
      [paramKey]: { type: 'any' as const, required: false }
    }
    // Send through main actions plugin state machine
    actionsPluginActor.send({
      type: 'ACTION.UPDATE_INPUT',
      actionId: action.id,
      input: updatedInput
    })
  }
  addingParameterForAction.value = null
  newParameterName.value = ''
}

function cancelAddParameter() {
  addingParameterForAction.value = null
  newParameterName.value = ''
}

function startEditParameter(actionId: string, key: string) {
  editingParameter.value = { actionId, key }
  // For actions, the key IS the display name (no separate name field like prompts)
  editedParameterName.value = key
  nextTick(() => {
    const input = document.querySelector(`[data-edit-param="${actionId}-${key}"]`) as HTMLInputElement
    input?.focus()
    input?.select()
  })
}

function confirmEditParameter(action: ActionEntity) {
  if (editingParameter.value && editedParameterName.value.trim()) {
    const { key: oldKey } = editingParameter.value
    const newKey = editedParameterName.value.trim()

    // Only update if the key actually changed
    if (oldKey !== newKey && action.input) {
      const updatedInput = { ...action.input }
      // Use newKey as the new key
      updatedInput[newKey] = {
        ...updatedInput[oldKey]
      }
      delete updatedInput[oldKey]
      // Send through main actions plugin state machine
      actionsPluginActor.send({
        type: 'ACTION.UPDATE_INPUT',
        actionId: action.id,
        input: updatedInput
      })
    }
  }
  editingParameter.value = null
  editedParameterName.value = ''
}

function cancelEditParameter() {
  editingParameter.value = null
  editedParameterName.value = ''
}

// Event handlers
const selectAction = (action: ActionEntity) => {
  codeActionsActor.send({ type: 'codeActions.OPEN_ACTION', actionId: action.id })
}

const goToAction = (action: ActionEntity) => {
  // Switch to actions plugin
  applicationState.send({ type: 'SELECT_PLUGIN', pluginId: 'actions' })

  // Select the action in the actions plugin
  const actionsPluginActor = applicationState.system.get('actions')
  if (actionsPluginActor) {
    actionsPluginActor.send({ type: 'ACTION.SELECT', actionId: action.id })
  }
}

const goToCreateAction = () => {
  // Switch to actions plugin
  applicationState.send({ type: 'SELECT_PLUGIN', pluginId: 'actions' })

  // Navigate to create view in the actions plugin
  const actionsPluginActor = applicationState.system.get('actions')
  if (actionsPluginActor) {
    actionsPluginActor.send({ type: 'ACTION.CREATE' })
  }
}

const refreshActions = () => {
  // Actions are already loaded by main actions plugin on connection
}

const goToPage = (newPage: number) => {
  if (newPage >= 1 && newPage <= totalPages.value) {
    actionsPluginActor.send({ type: 'PAGE.CHANGE', page: newPage })
  }
}

// No need to load on mount - main actions plugin loads on connection
onMounted(() => {
  // Actions are managed by the main actions plugin
})
</script>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* Override window drag region to make header elements clickable - only on interactive elements, not whitespace */
.actions-header > * {
  -webkit-app-region: no-drag;
}
</style>
