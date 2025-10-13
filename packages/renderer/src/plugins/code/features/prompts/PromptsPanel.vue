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

      <div
        v-for="prompt in prompts"
        :key="prompt.id"
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
                  class="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded bg-neutral-800 text-neutral-400"
                >
                  <span class="font-medium">{{ key }}</span>
                  <span class="text-neutral-500">({{ input.type }})</span>
                  <span v-if="input.required !== false" class="text-red-400">*</span>
                </span>
              </div>
              <div v-else class="text-xs italic text-neutral-500">
                No inputs
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
import { applicationState } from '@/main'
import { id as codeId, type CodeState } from '@/plugins/code/state'
import { RefreshCw, Sparkle, ExternalLink, Plus } from 'lucide-vue-next'
import type { PromptEntity, TemplateInput } from '@app/api'

// Get actors
const codeActor: CodeState = applicationState.system.get(codeId)
const promptsActor = codeActor.system.get('codePrompts')!

// State selectors
const prompts = useSelector(promptsActor, (state: any) => state.context.prompts)
const page = useSelector(promptsActor, (state: any) => state.context.page)
const totalPages = useSelector(promptsActor, (state: any) => state.context.totalPages)
const totalCount = useSelector(promptsActor, (state: any) => state.context.totalCount)
const isLoading = useSelector(promptsActor, (state: any) => state.context.isLoading)
const error = useSelector(promptsActor, (state: any) => state.context.error)

// Event handlers
const selectPrompt = (prompt: PromptEntity) => {
  promptsActor.send({ type: 'codePrompts.OPEN_PROMPT', promptId: prompt.id })
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
  promptsActor.send({ type: 'codePrompts.REFRESH_LIST' })
}

const goToPage = (newPage: number) => {
  if (newPage >= 1 && newPage <= totalPages.value) {
    promptsActor.send({ type: 'codePrompts.LIST', page: newPage })
  }
}

// Load prompts on mount
onMounted(() => {
  // Only load if we don't have prompts yet
  if (prompts.value.length === 0) {
    promptsActor.send({ type: 'codePrompts.LIST' })
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

/* Override window drag region to make header elements clickable - only on interactive elements, not whitespace */
.prompts-header > * {
  -webkit-app-region: no-drag;
}
</style>
