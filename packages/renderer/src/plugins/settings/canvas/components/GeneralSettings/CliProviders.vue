<template>
  <div class="space-y-4">
    <div>
      <h3 class="text-sm font-medium text-gray-300 uppercase tracking-wider">CLI Providers</h3>
      <p class="mt-1 text-xs text-neutral-500">Leave path blank to auto-detect. Click Test to verify and resolve.</p>
    </div>

    <div class="space-y-2">
      <CliProviderRow
        v-for="p in providers"
        :key="p.key"
        v-model="cliPathValues[p.key]"
        :label="p.label"
        :installHint="p.installHint"
        :installCmd="p.installCmd"
        placeholder="Path override (auto-detected if empty)"
        :testResult="cliTestResults?.[p.key]"
        @update:modelValue="debouncedSaveCliPaths()"
        @test="testCliProvider(p.key)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useDebounce } from '@/core/composables/useDebounce'
import { useSelector } from '@xstate/vue'
import { applicationState } from '@/main'
import CliProviderRow from './CliProviderRow.vue'

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

const settingsActor = applicationState.system.get('settings')
const cliTestResults = useSelector(settingsActor, (state: any) => state.context.cliTestResults)

const providers = [
  { key: 'copilot', label: 'Copilot CLI', installHint: 'Install via npm', installCmd: 'npm install -g @github/copilot' },
  { key: 'claude-code', label: 'Claude Code CLI', installHint: 'Install via npm', installCmd: 'npm install -g @anthropic-ai/claude-code' },
  { key: 'codex', label: 'Codex CLI', installHint: 'Install via npm', installCmd: 'npm install -g @openai/codex' },
  { key: 'gh', label: 'GitHub CLI', installHint: 'Install via Homebrew', installCmd: 'brew install gh' },
]

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
