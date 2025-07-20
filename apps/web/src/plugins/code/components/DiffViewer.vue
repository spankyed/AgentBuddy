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
        :language="getLanguage(selectedGitFile.path)"
        class="h-full"
      />
    </div>
    <div v-else class="flex items-center justify-center flex-1">
      <div class="text-neutral-400">Loading diff...</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { GitCompare } from 'lucide-vue-next'
import { VueMonacoDiffEditor } from '@guolao/vue-monaco-editor'
import type { GitStatusFile, GitDiff } from '../state'

// Props
defineProps<{
  selectedGitFile: GitStatusFile
  gitDiff: GitDiff | null
}>()

// Monaco diff editor options
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
}

// Helper function
const getLanguage = (path: string) => {
  const ext = path.split('.').pop() || ''
  const languageMap: Record<string, string> = {
    js: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    vue: 'html',
    py: 'python',
    java: 'java',
    c: 'c',
    cpp: 'cpp',
    go: 'go',
    rs: 'rust',
    php: 'php',
    rb: 'ruby',
    swift: 'swift',
    json: 'json',
    html: 'html',
    css: 'css',
    scss: 'scss',
    sass: 'sass',
    less: 'less',
    xml: 'xml',
    yaml: 'yaml',
    yml: 'yaml',
    md: 'markdown',
    sql: 'sql',
    sh: 'shell',
    bash: 'shell',
    ps1: 'powershell',
    dockerfile: 'dockerfile',
    makefile: 'makefile',
  }
  
  return languageMap[ext] || 'plaintext'
}
</script>