<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="flex items-center justify-between px-4 pt-3 pb-3 border-b border-neutral-800 prompts-header">
      <div class="flex items-center gap-2">
        <Sparkle :size="16" class="text-neutral-400" />
        <h3 class="text-sm font-medium text-neutral-200">Prompts</h3>
      </div>
      <div class="flex items-center gap-1">
        <button
          @click="goToCreatePrompt"
          class="p-0 transition-colors rounded text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
          title="Create new prompt"
        >
          <Plus :size="16" />
        </button>
        <!-- <button
          @click="refreshPrompts"
          :disabled="isLoading"
          class="p-1 transition-colors rounded text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
          title="Refresh prompts"
        >
          <RefreshCw :size="16" :class="{ 'animate-spin': isLoading }" />
        </button> -->
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading && prompts.length === 0" class="flex items-center justify-center flex-1">
      <div class="text-sm text-neutral-400">Loading prompts...</div>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="p-4 m-2 border rounded bg-red-500/10 border-red-500/50">
      <div class="text-sm text-red-400">{{ error }}</div>
    </div>

    <!-- Prompts List -->
    <div v-else class="flex-1 overflow-auto">
      <div v-if="prompts.length === 0" class="p-4 text-sm text-center text-neutral-400">
        No prompts found
      </div>

      <ContextMenuRoot v-for="prompt in prompts" :key="prompt.id">
        <ContextMenuTrigger as-child>
          <div
            @click="selectPrompt(prompt)"
            class="px-4 py-3 transition-colors border-b cursor-pointer border-neutral-800 hover:bg-neutral-800/50"
          >
            <div class="flex items-start justify-between">
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium truncate text-neutral-200" :title="prompt.description">
                  {{ prompt.label }}
                </div>
                <div class="mt-1 space-y-1">
                  <!-- Input Parameters -->
                  <div v-if="prompt.inputs && Object.keys(prompt.inputs).length > 0" class="flex flex-wrap gap-1">
                    <span
                      v-for="(input, key) in prompt.inputs"
                      :key="key"
                      @click.stop="startEditParameter(prompt.id, String(key))"
                      class="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded bg-neutral-800 text-neutral-400 cursor-pointer hover:bg-neutral-700 transition-colors"
                    >
                      <template v-if="editingParameter?.promptId === prompt.id && editingParameter?.key === String(key)">
                        <input
                          v-model="editedParameterName"
                          :data-edit-param="`${prompt.id}-${key}`"
                          @keydown.enter.stop="confirmEditParameter(prompt)"
                          @keydown.escape.stop="cancelEditParameter"
                          @blur="confirmEditParameter(prompt)"
                          @click.stop
                          class="w-16 px-1 text-xs bg-transparent border-b border-blue-500 focus:outline-none text-neutral-200"
                        />
                      </template>
                      <template v-else>
                        <span class="font-medium">{{ input.name || key }}</span>
                        <span class="text-neutral-500">({{ input.type }})</span>
                        <span v-if="input.required !== false" class="text-red-400">*</span>
                      </template>
                    </span>
                  </div>
                  <div v-else-if="addingParameterForPrompt !== prompt.id" class="text-xs italic text-neutral-500">
                    No inputs
                  </div>

                  <!-- Add Parameter Input -->
                  <div v-if="addingParameterForPrompt === prompt.id" class="mt-1">
                    <input
                      v-model="newParameterName"
                      :data-add-param="prompt.id"
                      @keydown.enter.stop="confirmAddParameter(prompt)"
                      @keydown.escape.stop="cancelAddParameter"
                      @blur="confirmAddParameter(prompt)"
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
                <div v-if="prompt.category">
                  <span class="inline-flex items-center px-2 py-0.5 text-[10px] font-medium rounded bg-neutral-700 text-neutral-300">
                    {{ prompt.category }}
                  </span>
                </div>

                <!-- External Link Button -->
                <button
                  @click.stop="goToPrompt(prompt)"
                  class="p-1 transition-colors rounded text-neutral-500 hover:text-neutral-200 hover:bg-neutral-700"
                  title="Go to prompt"
                >
                  <ExternalLink :size="16" />
                </button>
              </div>
            </div>
          </div>
        </ContextMenuTrigger>

        <ContextMenuPortal>
          <ContextMenuContent :class="MENU_CONTENT_CLASS">
            <ContextMenuItem @select="startAddParameter(prompt)" :class="MENU_ITEM_CLASS">
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
import { id as promptsPluginId } from '@/plugins/prompts/state'
import { RefreshCw, Sparkle, ExternalLink, Plus } from 'lucide-vue-next'
import type { PromptEntity, TemplateInput } from '@app/api'
import {
  ContextMenuRoot,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuPortal,
} from 'reka-ui'
import { MENU_CONTENT_CLASS, MENU_ITEM_CLASS } from '../explorer/constants'

// Get actors - use main prompts plugin for state, codePrompts for tab management
const codeActor: CodeState = applicationState.system.get(codeId)
const codePromptsActor = codeActor.system.get('codePrompts')!
const promptsPluginActor = applicationState.system.get(promptsPluginId)!

// State selectors - read from main prompts plugin (single source of truth)
const prompts = useSelector(promptsPluginActor, (state: any) => state.context.prompts)
const page = useSelector(promptsPluginActor, (state: any) => state.context.page)
const totalPages = useSelector(promptsPluginActor, (state: any) => state.context.totalPages)
const totalCount = useSelector(promptsPluginActor, (state: any) => state.context.totalCount)
const isLoading = ref(false)
const error = ref<string | null>(null)

// State for adding/editing parameters
const addingParameterForPrompt = ref<string | null>(null)
const newParameterName = ref('')
const editingParameter = ref<{ promptId: string, key: string } | null>(null)
const editedParameterName = ref('')

function startAddParameter(prompt: PromptEntity) {
  addingParameterForPrompt.value = prompt.id
  newParameterName.value = ''
  nextTick(() => {
    const input = document.querySelector(`[data-add-param="${prompt.id}"]`) as HTMLInputElement
    input?.focus()
  })
}

function confirmAddParameter(prompt: PromptEntity) {
  if (newParameterName.value.trim()) {
    const paramKey = newParameterName.value.trim()
    const updatedInputs = {
      ...prompt.inputs,
      [paramKey]: { name: paramKey, type: 'any' as const, required: false }
    }
    // Send through state machine
    codePromptsActor.send({
      type: 'codePrompts.UPDATE_PROMPT_INPUTS',
      promptId: prompt.id,
      inputs: updatedInputs
    })
  }
  addingParameterForPrompt.value = null
  newParameterName.value = ''
}

function cancelAddParameter() {
  addingParameterForPrompt.value = null
  newParameterName.value = ''
}

function startEditParameter(promptId: string, key: string) {
  // Find the prompt to get the actual parameter data
  const prompt = prompts.value.find((p: PromptEntity) => p.id === promptId)
  const inputData = prompt?.inputs?.[key]
  const displayName = inputData?.name || key

  editingParameter.value = { promptId, key }
  editedParameterName.value = displayName
  nextTick(() => {
    const input = document.querySelector(`[data-edit-param="${promptId}-${key}"]`) as HTMLInputElement
    input?.focus()
    input?.select()
  })
}

function confirmEditParameter(prompt: PromptEntity) {
  if (editingParameter.value && editedParameterName.value.trim()) {
    const { key: oldKey } = editingParameter.value
    const newName = editedParameterName.value.trim()
    const oldInputData = prompt.inputs?.[oldKey]
    const oldName = oldInputData?.name || oldKey

    // Only update if the name actually changed
    if (oldName !== newName && prompt.inputs) {
      const updatedInputs = { ...prompt.inputs }
      // Use newName as the new key
      updatedInputs[newName] = {
        ...updatedInputs[oldKey],
        name: newName
      }
      delete updatedInputs[oldKey]
      // Send through state machine
      codePromptsActor.send({
        type: 'codePrompts.UPDATE_PROMPT_INPUTS',
        promptId: prompt.id,
        inputs: updatedInputs
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
const selectPrompt = (prompt: PromptEntity) => {
  codePromptsActor.send({ type: 'codePrompts.OPEN_PROMPT', promptId: prompt.id })
}

const goToPrompt = (prompt: PromptEntity) => {
  // Switch to prompts plugin
  applicationState.send({ type: 'SELECT_PLUGIN', pluginId: 'prompts' })

  // Select the prompt in the prompts plugin
  const promptsPluginActor = applicationState.system.get('prompts')
  if (promptsPluginActor) {
    promptsPluginActor.send({ type: 'PROMPT.SELECT', promptId: prompt.id })
  }
}

const goToCreatePrompt = () => {
  // Switch to prompts plugin
  applicationState.send({ type: 'SELECT_PLUGIN', pluginId: 'prompts' })

  // Navigate to create view in the prompts plugin
  const promptsPluginActor = applicationState.system.get('prompts')
  if (promptsPluginActor) {
    promptsPluginActor.send({ type: 'PROMPT.CREATE' })
  }
}

const refreshPrompts = () => {
  // Prompts are already loaded by main prompts plugin on connection
}

const goToPage = (newPage: number) => {
  if (newPage >= 1 && newPage <= totalPages.value) {
    promptsPluginActor.send({ type: 'PAGE.CHANGE', page: newPage })
  }
}

// No need to load on mount - main prompts plugin loads on connection
onMounted(() => {
  // Prompts are managed by the main prompts plugin
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
.prompts-header > * {
  -webkit-app-region: no-drag;
}
</style>
