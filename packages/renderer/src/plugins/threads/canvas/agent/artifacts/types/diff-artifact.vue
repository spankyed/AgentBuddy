<template>
  <div class="flex h-full gap-3">
    <!-- File list (left) -->
    <div class="w-64 flex-shrink-0 overflow-y-auto rounded-md border border-neutral-800 bg-neutral-850">
      <div class="px-3 py-2 border-b border-neutral-800 text-xs text-neutral-500">
        {{ content.summary || 'No changes' }}
      </div>
      <div v-for="(file, idx) in content.files" :key="file.path">
        <button
          type="button"
          class="w-full text-left px-3 py-2 hover:bg-neutral-800/60 border-b border-neutral-800/40 last:border-0 transition-colors"
          :class="{ 'bg-neutral-800/80': selectedIdx === Number(idx) }"
          @click="selectedIdx = Number(idx)"
        >
          <div class="flex items-center gap-2">
            <component :is="changeIcon(file.changeType)" :size="12" :class="changeIconClass(file.changeType)" />
            <span class="text-xs font-mono text-neutral-200 truncate flex-1" :title="file.path">
              {{ shortenPath(file.path) }}
            </span>
          </div>
          <div class="mt-0.5 text-[10px] text-neutral-500 tabular-nums">
            <span v-if="file.added" class="text-green-500">+{{ file.added }}</span>
            <span v-if="file.added && file.removed" class="text-neutral-600"> </span>
            <span v-if="file.removed" class="text-red-500">-{{ file.removed }}</span>
          </div>
        </button>
      </div>
      <div v-if="content.files.length === 0" class="px-3 py-8 text-xs text-neutral-500 text-center">
        No files in this diff
      </div>
    </div>

    <!-- Unified diff viewer (right) -->
    <div class="flex-1 overflow-auto rounded-md border border-neutral-800 bg-neutral-900">
      <div v-if="!selectedFile" class="flex items-center justify-center h-full text-xs text-neutral-600">
        Select a file to view its diff
      </div>
      <pre v-else class="text-[11px] font-mono p-3 leading-relaxed whitespace-pre overflow-x-auto"><template v-for="(line, i) in selectedFile.patch.split('\n')" :key="i"><span :class="lineClass(line)">{{ line }}</span><br></template></pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { FilePlus2, FileMinus2, FilePenLine, ArrowRightLeft } from 'lucide-vue-next'
import type { ArtifactItem } from '@app/api'

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

function lineClass(line: string): string {
  if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('new file') || line.startsWith('deleted file') || line.startsWith('rename ')) {
    return 'text-neutral-600'
  }
  if (line.startsWith('+++') || line.startsWith('---')) return 'text-neutral-500'
  if (line.startsWith('@@')) return 'text-blue-400'
  if (line.startsWith('+')) return 'text-green-400'
  if (line.startsWith('-')) return 'text-red-400'
  return 'text-neutral-300'
}
</script>
