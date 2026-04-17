<template>
  <div class="tool-input-block rounded-lg border border-neutral-700/60 overflow-hidden text-xs font-mono bg-neutral-900/40">
    <!-- File path header (Edit/Write/NotebookEdit) -->
    <div v-if="filePath" class="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800/60 border-b border-neutral-700/40 text-neutral-500 truncate" :title="filePath">
      <FileCode class="w-3.5 h-3.5 flex-shrink-0 text-neutral-500" />
      <span class="truncate">{{ fileName }}</span>
    </div>

    <!-- Edit: Monaco diff viewer -->
    <template v-if="toolName === 'Edit'">
      <div class="diff-container h-48">
        <UnifiedMonacoEditor
          model-value=""
          :diff-original="input?.old_string || ''"
          :diff-modified="input?.new_string || ''"
          :file-path="filePath || undefined"
          mode="diff"
          preset="readonly"
          :read-only="true"
          theme="vs-dark"
          :diff-options="diffOptions"
          class="h-full"
        />
      </div>
    </template>

    <!-- Write: Monaco code preview -->
    <template v-else-if="toolName === 'Write'">
      <div class="h-48">
        <UnifiedMonacoEditor
          :model-value="truncatedContent"
          :file-path="filePath || undefined"
          mode="simple"
          preset="readonly"
          theme="vs-dark"
          class="h-full"
        />
      </div>
    </template>

    <!-- Bash: command -->
    <template v-else-if="toolName === 'Bash'">
      <pre class="p-3 leading-relaxed whitespace-pre-wrap overflow-x-auto text-neutral-300">$ {{ input?.command }}</pre>
    </template>

    <!-- Other: collapsible JSON -->
    <template v-else>
      <details>
        <summary class="px-3 py-2 cursor-pointer text-neutral-400 hover:text-neutral-300 select-none">
          View input ({{ fieldCount }} {{ fieldCount === 1 ? 'field' : 'fields' }})
        </summary>
        <pre class="p-3 border-t border-neutral-700 leading-relaxed whitespace-pre overflow-x-auto text-neutral-300 max-h-64 overflow-y-auto">{{ formattedJson }}</pre>
      </details>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { FileCode } from 'lucide-vue-next'
import UnifiedMonacoEditor from '@/core/components/UnifiedMonacoEditor.vue'

const props = withDefaults(defineProps<{
  toolName: string
  input?: Record<string, any>
}>(), {
  input: () => ({}),
})

const filePath = computed(() =>
  props.input?.file_path || props.input?.path || null
)

const fileName = computed(() => {
  if (!filePath.value) return ''
  return filePath.value.split('/').pop() || filePath.value
})

const diffOptions = {
  // Diff-specific
  renderSideBySide: false,
  renderMarginRevertIcon: false,
  renderGutterMenu: false,
  renderIndicators: false,
  renderOverviewRuler: false,
  compactMode: true,
  // Editor chrome
  lineNumbers: 'off',
  glyphMargin: false,
  folding: false,
  lineDecorationsWidth: 0,
  scrollBeyondLastLine: false,
}

const MAX_CONTENT_LENGTH = 2000
const truncatedContent = computed(() => {
  const content = props.input?.content || props.input?.file_text || ''
  if (content.length > MAX_CONTENT_LENGTH) {
    return content.slice(0, MAX_CONTENT_LENGTH) + '\n… (truncated)'
  }
  return content
})

const fieldCount = computed(() => Object.keys(props.input || {}).length)

const formattedJson = computed(() => JSON.stringify(props.input, null, 2))
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
/* Deleted lines rendered as view zones in inline diff */
.diff-container :deep(.monaco-editor .line-delete .view-line) {
  padding-left: 12px !important;
  padding-right: 12px !important;
}
</style>
