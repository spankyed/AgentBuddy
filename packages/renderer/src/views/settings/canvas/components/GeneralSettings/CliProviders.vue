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
import { usePlugin } from '@abuddy/sdk/fe'
import { useSettingsSaveStatus } from '@/views/settings/save'
import { useDebounce } from '@abuddy/ui/composables/useDebounce'
import { useSelector } from '@xstate/vue'
import CliProviderRow from './CliProviderRow.vue'
import { pluginSettings } from '@/views/settings/plugin-settings';
import { resolveName } from '@abuddy/sdk/ids';

const { updateSettings } = useSettingsSaveStatus()

const settingsActor = usePlugin()
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

// CLI path overrides live in the code plugin's settings
const storedCliPaths = useSelector(settingsActor, (state: any) => pluginSettings(state.context.settings, resolveName('code', 'default-setup'))?.cliPaths as Record<string, string> | undefined)
const cliPathValues = ref<Record<string, string>>({})

watch(storedCliPaths, (newPaths) => {
  cliPathValues.value = { ...newPaths }
}, { immediate: true })

const { debounced: debouncedSaveCliPaths } = useDebounce(() => {
  updateSettings({
    entityType: 'plugin',
    label: resolveName('code', 'default-setup'),
    path: ['cliPaths'],
    value: { ...cliPathValues.value }
  })
}, 600)
</script>
