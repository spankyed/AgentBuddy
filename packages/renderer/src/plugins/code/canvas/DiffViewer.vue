<template>
  <div class="flex flex-col h-full">
    <!-- <div class="flex items-center gap-2 px-4 py-2 border-b bg-neutral-800 border-neutral-700">
      <GitCompare class="w-4 h-4 text-neutral-400" />
      <span class="text-sm text-neutral-300">{{ selectedGitFile.path }}</span>
      <span class="text-xs px-2 py-0.5 rounded" :class="selectedGitFile.staged ? 'bg-green-900 text-green-400' : 'bg-yellow-900 text-yellow-400'">
        {{ selectedGitFile.staged ? 'Staged' : 'Unstaged' }}
      </span>
    </div> -->
    <div v-if="gitDiff" class="flex-1">
      <VueMonacoDiffEditor
        :original="gitDiff.originalContent || ''"
        :modified="gitDiff.modifiedContent || ''"
        :options="diffEditorOptions"
        theme="vs-dark"
        :language="getLanguageId(selectedGitFile.path)"
        class="h-full"
      />
    </div>
    <div v-else class="flex items-center justify-center flex-1">
      <div class="text-neutral-400">Loading diff...</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { GitCompare } from 'lucide-vue-next'
import { VueMonacoDiffEditor } from '@guolao/vue-monaco-editor'
import type { GitStatusFile, GitDiff } from '@/plugins/code/features/commit/state'
import { getLanguageId } from '@/plugins/code/utils/simple-monaco-config'

// Props
defineProps<{
  selectedGitFile: GitStatusFile
  gitDiff: GitDiff | null
}>()

// No setup needed - using basic Monaco

// Monaco diff editor options with enhanced features
const diffEditorOptions = {
  fontSize: 14,
  lineNumbers: 'on' as const,
  minimap: { enabled: false },
  automaticLayout: true,
  scrollBeyondLastLine: false,
  wordWrap: 'on' as const,
  readOnly: true,
  renderSideBySide: true,
  enableSplitViewResizing: true,
  // Enhanced options for better diff viewing
  diffWordWrap: 'on' as const,
  ignoreTrimWhitespace: false,
  renderIndicators: true,
  originalEditable: false,
  // Enable folding in diff view
  folding: true,
  // Bracket matching
  bracketPairColorization: {
    enabled: true
  },
  // Hover
  hover: {
    enabled: true,
    delay: 300
  },
}
</script>