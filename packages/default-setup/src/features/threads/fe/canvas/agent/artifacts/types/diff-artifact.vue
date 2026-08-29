<template>
  <div class="flex h-full gap-3">
    <!-- File list (left) -->
    <div class="w-56 flex-shrink-0 overflow-y-auto rounded-lg border border-neutral-700/50 bg-neutral-900/60">
      <div class="px-3 py-2 border-b border-neutral-700/30 text-[11px] text-neutral-500 tracking-wide">
        {{ content.summary || 'No changes' }}
      </div>
      <div class="py-1">
        <button
          v-for="(file, idx) in content.files"
          :key="file.path"
          type="button"
          class="group w-full text-left px-3 py-1.5 transition-colors"
          :class="selectedIdx === Number(idx)
            ? 'bg-neutral-800/70'
            : 'hover:bg-neutral-800/40'"
          @click="selectedIdx = Number(idx)"
        >
          <div class="flex items-center gap-2">
            <component :is="changeIcon(file.changeType)" :size="11" :class="changeIconClass(file.changeType)" class="flex-shrink-0" />
            <span class="text-xs font-mono text-neutral-300 truncate flex-1" :title="file.path">
              {{ shortenPath(file.path) }}
            </span>
            <span class="text-[10px] tabular-nums flex-shrink-0 space-x-0.5">
              <span v-if="file.added" class="text-green-500/80">+{{ file.added }}</span>
              <span v-if="file.removed" class="text-red-500/80">-{{ file.removed }}</span>
            </span>
          </div>
        </button>
      </div>
      <div v-if="content.files.length === 0" class="px-3 py-8 text-xs text-neutral-500 text-center">
        No files in this diff
      </div>
    </div>

    <!-- Monaco diff viewer (right) -->
    <div class="flex-1 overflow-hidden rounded-lg border border-neutral-700/50">
      <div v-if="!selectedFile" class="flex items-center justify-center h-full text-xs text-neutral-600 bg-neutral-900">
        Select a file to view its diff
      </div>
      <div v-else class="diff-container h-full">
        <UnifiedMonacoEditor
          :key="selectedFile.path"
          :model-value="versions.modified"
          mode="diff"
          :diff-original="versions.original"
          :diff-modified="versions.modified"
          :language="fileLanguage"
          :read-only="true"
          :file-path="selectedFile.path"
          preset="readonly"
          :diff-options="diffEditorOptions"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { FilePlus2, FileMinus2, FilePenLine, ArrowRightLeft } from 'lucide-vue-next'
import type { ArtifactItem } from '@app/api'
import UnifiedMonacoEditor from '@/core/components/UnifiedMonacoEditor.vue'
import { getLanguageFromPath } from '@/core/utils/monaco-config'

interface DiffFile {
  path: string
  patch: string
  added: number
  removed: number
  changeType: 'added' | 'modified' | 'deleted' | 'renamed'
}

interface DiffContent {
  files: DiffFile[]
  summary: string
}

const props = defineProps<{
  artifact: ArtifactItem & { content: DiffContent }
}>()

const content = computed(() => props.artifact.content)

const selectedIdx = ref(0)
const selectedFile = computed(() => content.value.files[selectedIdx.value])

const fileLanguage = computed(() =>
  selectedFile.value ? getLanguageFromPath(selectedFile.value.path) : 'plaintext'
)

/** Extract original and modified content from a unified diff patch. */
function patchToVersions(patch: string): { original: string; modified: string } {
  const lines = patch.split('\n')
  const original: string[] = []
  const modified: string[] = []

  for (const line of lines) {
    // Skip diff headers
    if (
      line.startsWith('diff --git') ||
      line.startsWith('index ') ||
      line.startsWith('new file') ||
      line.startsWith('deleted file') ||
      line.startsWith('rename ') ||
      line.startsWith('---') ||
      line.startsWith('+++')
    ) continue

    // Skip hunk headers
    if (line.startsWith('@@')) continue

    if (line.startsWith('+')) {
      modified.push(line.slice(1))
    } else if (line.startsWith('-')) {
      original.push(line.slice(1))
    } else {
      // Context line (starts with space) or empty line
      const content = line.startsWith(' ') ? line.slice(1) : line
      original.push(content)
      modified.push(content)
    }
  }

  return {
    original: original.join('\n'),
    modified: modified.join('\n'),
  }
}

const versions = computed(() =>
  selectedFile.value ? patchToVersions(selectedFile.value.patch) : { original: '', modified: '' }
)

const diffEditorOptions = {
  // Diff-specific
  renderSideBySide: false,
  renderMarginRevertIcon: false,
  renderGutterMenu: false,
  renderIndicators: false,
  renderOverviewRuler: false,
  compactMode: true,
  // Editor chrome
  originalEditable: false,
  contextmenu: false,
  lineNumbers: 'off',
  glyphMargin: false,
  folding: false,
  lineDecorationsWidth: 0,
  scrollBeyondLastLine: false,
}

function changeIcon(type: DiffFile['changeType']) {
  switch (type) {
    case 'added': return FilePlus2
    case 'deleted': return FileMinus2
    case 'renamed': return ArrowRightLeft
    default: return FilePenLine
  }
}

function changeIconClass(type: DiffFile['changeType']): string {
  switch (type) {
    case 'added': return 'text-green-500'
    case 'deleted': return 'text-red-500'
    case 'renamed': return 'text-blue-400'
    default: return 'text-neutral-400'
  }
}

function shortenPath(path: string): string {
  const segments = path.split('/').filter(Boolean)
  if (segments.length <= 3) return path
  return `…/${segments.slice(-3).join('/')}`
}
</script>

<style scoped>
/* Soften Monaco's default diff colors */
.diff-container :deep(.monaco-editor .line-delete) {
  background-color: rgba(248, 81, 73, 0.10) !important;
}
.diff-container :deep(.monaco-editor .char-delete) {
  background-color: rgba(248, 81, 73, 0.22) !important;
}
.diff-container :deep(.monaco-editor .line-insert) {
  background-color: rgba(63, 185, 80, 0.10) !important;
}
.diff-container :deep(.monaco-editor .char-insert) {
  background-color: rgba(63, 185, 80, 0.22) !important;
}

/* Horizontal padding inside diff highlighted regions */
.diff-container :deep(.monaco-editor .view-lines > .view-line) {
  padding-left: 12px !important;
  padding-right: 12px !important;
}
.diff-container :deep(.monaco-editor .line-delete .view-line) {
  padding-left: 12px !important;
  padding-right: 12px !important;
}
</style>
