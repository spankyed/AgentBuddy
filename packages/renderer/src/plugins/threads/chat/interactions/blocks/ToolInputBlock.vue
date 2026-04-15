<template>
  <div class="tool-input-block rounded-lg border border-neutral-700 overflow-hidden text-xs font-mono">
    <!-- File path header (Edit/Write/NotebookEdit) -->
    <div v-if="filePath" class="px-3 py-1.5 bg-neutral-800 border-b border-neutral-700 text-neutral-400 truncate" :title="filePath">
      {{ filePath }}
    </div>

    <!-- Edit: Monaco diff viewer -->
    <template v-if="toolName === 'Edit'">
      <div class="h-48">
        <UnifiedMonacoEditor
          model-value=""
          :diff-original="input?.old_string || ''"
          :diff-modified="input?.new_string || ''"
          :file-path="filePath || undefined"
          mode="diff"
          preset="readonly"
          theme="vs-dark"
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
