<template>
  <div class="space-y-4">
    <h3 class="text-sm font-medium text-gray-300 uppercase tracking-wider">CLI Providers</h3>

    <div class="space-y-3">
      <!-- Copilot -->
      <CliProviderRow
        providerKey="copilot"
        v-model="cliPathValues.copilot"
        placeholder="Binary path, e.g. /usr/local/bin/copilot (default: copilot)"
        :testResult="cliTestResults?.copilot"
        @update:modelValue="debouncedSaveCliPaths()"
        @test="testCliProvider('copilot')"
      >
        <label class="block text-sm font-medium text-gray-200">Copilot CLI</label>
        <div class="mt-1 flex items-center gap-2">
          <span class="text-xs text-neutral-500">Install via npm</span>
          <CliCommand>npm install -g @github/copilot</CliCommand>
        </div>
      </CliProviderRow>

      <!-- Claude Code -->
      <CliProviderRow
        providerKey="claude-code"
        v-model="cliPathValues['claude-code']"
        placeholder="Binary path, e.g. /usr/local/bin/claude (default: claude)"
        :testResult="cliTestResults?.['claude-code']"
        @update:modelValue="debouncedSaveCliPaths()"
        @test="testCliProvider('claude-code')"
      >
        <label class="block text-sm font-medium text-gray-200">Claude Code CLI</label>
        <div class="mt-1 flex items-center gap-2">
          <span class="text-xs text-neutral-500">Install via npm</span>
          <CliCommand>npm install -g @anthropic-ai/claude-code</CliCommand>
        </div>
      </CliProviderRow>

      <!-- Codex -->
      <CliProviderRow
        providerKey="codex"
        v-model="cliPathValues.codex"
        placeholder="Binary path, e.g. /usr/local/bin/codex (default: codex)"
        :testResult="cliTestResults?.codex"
        @update:modelValue="debouncedSaveCliPaths()"
        @test="testCliProvider('codex')"
      >
        <label class="block text-sm font-medium text-gray-200">Codex CLI</label>
        <div class="mt-1 flex items-center gap-2">
          <span class="text-xs text-neutral-500">Install via npm</span>
          <CliCommand>npm install -g @openai/codex</CliCommand>
        </div>
      </CliProviderRow>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useDebounce } from '@/core/composables/useDebounce'
import { useSelector } from '@xstate/vue'
import { applicationState } from '@/main'
import CliProviderRow from './CliProviderRow.vue'
import CliCommand from './CliCommand.vue'

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
