<template>
  <div class="space-y-4">
    <h3 class="text-sm font-medium text-gray-300 uppercase tracking-wider">CLI Providers</h3>

    <div class="grid grid-cols-[1fr,400px,80px] gap-y-3 gap-x-4 items-center">
      <template v-for="provider in cliProviders" :key="provider.key">
        <!-- Provider Label Column -->
        <div>
          <label class="block text-sm font-medium text-gray-200">{{ provider.label }}</label>
          <p class="text-xs text-gray-500 mt-0.5">
            {{ provider.guide }} <code class="px-1.5 py-0.5 bg-neutral-800 rounded text-gray-400 font-mono">{{ provider.command }}</code>
          </p>
        </div>

        <!-- CLI Path Input Column -->
        <div>
          <input
            type="text"
            v-model="cliPathValues[provider.key]"
            :placeholder="provider.placeholder"
            @input="debouncedSaveCliPaths()"
            class="w-full px-3 py-1.5 bg-neutral-800 border border-neutral-700/50 rounded-md text-white placeholder-neutral-600 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 hover:border-neutral-600 transition-all"
          />
        </div>

        <!-- Test Button + Status Column -->
        <div class="flex justify-end items-center gap-2">
          <CheckCircle
            v-if="cliTestResults?.[provider.key] === 'success'"
            class="w-4 h-4 text-green-400"
          />
          <XCircle
            v-else-if="cliTestResults?.[provider.key] === 'error'"
            class="w-4 h-4 text-red-400"
          />
          <button
            @click="testCliProvider(provider.key)"
            :disabled="cliTestResults?.[provider.key] === 'testing'"
            class="px-2.5 py-1 text-xs font-medium rounded-md transition-colors"
            :class="cliTestResults?.[provider.key] === 'testing'
              ? 'bg-neutral-700 text-neutral-500 cursor-not-allowed'
              : 'bg-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-700 border border-neutral-700/50'"
            title="Test if CLI is available"
          >
            <Loader2
              v-if="cliTestResults?.[provider.key] === 'testing'"
              class="w-3.5 h-3.5 animate-spin"
            />
            <span v-else>Test</span>
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { CheckCircle, XCircle, Loader2 } from 'lucide-vue-next'
import { useDebounce } from '@/core/composables/useDebounce'
import { useSelector } from '@xstate/vue'
import { applicationState } from '@/main'

interface Props {
  settings?: {
    cliPaths?: Record<string, string>
  }
}

const props = withDefaults(defineProps<Props>(), {
  settings: () => ({})
})

const emit = defineEmits<{
  'update-setting': [{
    path: string[]
    value: any
  }]
}>()

const cliProviders = [
  { key: 'copilot', label: 'Copilot CLI', guide: 'Install GitHub CLI, then run:', command: 'gh extension install github/gh-copilot', placeholder: 'Binary path, e.g. /usr/local/bin/gh (default: gh)' },
  { key: 'claude-code', label: 'Claude Code CLI', guide: 'Install via:', command: 'npm install -g @anthropic-ai/claude-code', placeholder: 'Binary path, e.g. /usr/local/bin/claude (default: claude)' },
  { key: 'codex', label: 'Codex CLI', guide: 'Install via:', command: 'npm install -g @openai/codex', placeholder: 'Binary path, e.g. /usr/local/bin/codex (default: codex)' },
]

const settingsActor = applicationState.system.get('settings')
const cliTestResults = useSelector(settingsActor, (state: any) => state.context.cliTestResults)

const testCliProvider = (provider: string) => {
  settingsActor.send({ type: 'CLI.TEST', provider })
}

// CLI path state
const cliPathValues = ref<Record<string, string>>({ ...props.settings?.cliPaths })

watch(() => props.settings?.cliPaths, (newPaths) => {
  if (newPaths) {
    cliPathValues.value = { ...newPaths }
  }
}, { immediate: true })

const { debounced: debouncedSaveCliPaths } = useDebounce(() => {
  emit('update-setting', {
    path: ['cliPaths'],
    value: { ...cliPathValues.value }
  })
}, 600)
</script>
