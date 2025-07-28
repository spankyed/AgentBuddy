<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-2 border-b border-neutral-800">
      <div class="flex items-center gap-2">
        <Play :size="16" class="text-neutral-400" />
        <h3 class="text-sm font-medium text-neutral-200">Actions</h3>
      </div>
      <button
        @click="refreshActions"
        :disabled="isLoading"
        class="p-1 transition-colors rounded text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
        title="Refresh actions"
      >
        <RefreshCw :size="16" :class="{ 'animate-spin': isLoading }" />
      </button>
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
      
      <div
        v-for="action in actions"
        :key="action.id"
        @click="selectAction(action)"
        class="px-4 py-3 transition-colors border-b cursor-pointer border-neutral-800 hover:bg-neutral-800/50"
      >
        <div class="flex items-start justify-between">
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium truncate text-neutral-200">
              {{ action.label }}
            </div>
            <div v-if="action.description" class="mt-1 text-xs text-neutral-400 line-clamp-2">
              {{ action.description }}
            </div>
            <div v-if="action.category" class="mt-1">
              <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-neutral-700 text-neutral-300">
                {{ action.category }}
              </span>
            </div>
          </div>
          <button
            @click.stop="goToAction(action)"
            class="p-1 ml-2 transition-colors rounded text-neutral-500 hover:text-neutral-200 hover:bg-neutral-700"
            title="Go to action"
          >
            <ExternalLink :size="16" />
          </button>
        </div>
      </div>
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
import { computed, onMounted } from 'vue'
import { useSelector } from '@xstate/vue'
import { applicationState } from '@/app'
import { id as codeId, type CodeState } from '@/plugins/code/state'
import { RefreshCw, Play, ExternalLink } from 'lucide-vue-next'
import type { ActionEntity } from '@abuddy/api'

// Get actors
const codeActor: CodeState = applicationState.system.get(codeId)
const actionsActor = codeActor.system.get('codeActions')!

// State selectors
const actions = useSelector(actionsActor, (state: any) => state.context.actions)
const page = useSelector(actionsActor, (state: any) => state.context.page)
const totalPages = useSelector(actionsActor, (state: any) => state.context.totalPages)
const totalCount = useSelector(actionsActor, (state: any) => state.context.totalCount)
const isLoading = useSelector(actionsActor, (state: any) => state.context.isLoading)
const error = useSelector(actionsActor, (state: any) => state.context.error)

// Event handlers
const selectAction = (action: ActionEntity) => {
  actionsActor.send({ type: 'codeActions.OPEN_ACTION', actionId: action.id })
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

const refreshActions = () => {
  actionsActor.send({ type: 'codeActions.REFRESH_LIST' })
}

const goToPage = (newPage: number) => {
  if (newPage >= 1 && newPage <= totalPages.value) {
    actionsActor.send({ type: 'codeActions.LIST', page: newPage })
  }
}

// Load actions on mount
onMounted(() => {
  // Only load if we don't have actions yet
  if (actions.value.length === 0) {
    actionsActor.send({ type: 'codeActions.LIST' })
  }
})
</script>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>