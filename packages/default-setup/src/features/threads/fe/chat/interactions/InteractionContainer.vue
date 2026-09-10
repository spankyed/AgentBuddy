<template>
  <div class="interaction-container mt-3 space-y-3">
    <template v-for="(block, index) in blocks" :key="index">
      <component
        v-if="getBlockComponent(block.type)"
        :is="getBlockComponent(block.type)"
        :ref="(el: any) => captureRef(block.type, el)"
        v-bind="blockBindings(block)"
        @submit="getSubmitHandler(block.type)($event)"
        @cancel="handleCancel"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import type { BlockConfig } from '@/__generated__/types'
import { blockRegistry } from '@abuddy/sdk/blocks'
import { ref, computed } from 'vue'
import { useActorSystem } from '@abuddy/sdk/fe'
import { id as threadsId } from '@/features/threads/fe/state'

interface Props {
  blocks: BlockConfig[]
  messageId: string
  isDisabled?: boolean
  response?: any
}

const props = withDefaults(defineProps<Props>(), {
  isDisabled: false
})

const actorSystem = useActorSystem()
const threadsActor = actorSystem.get(threadsId)

// ─── Block component resolution ─────────────────────────────────────
const getBlockComponent = (type: string) => blockRegistry.getComponent(type)

const blockBindings = (block: BlockConfig) => {
  const base = { ...block.props }
  if (blockRegistry.get(block.type)?.kind === 'input') {
    base.disabled = props.isDisabled
    base.response = responseForBlock(block.type)
  }
  return base
}

// ─── Toggles ref (cross-block state) ────────────────────────────────
const togglesRef = ref<{ values?: Record<string, any> } | null>(null)
const captureRef = (type: string, el: any) => {
  if (type === 'toggles') togglesRef.value = el
}

// ─── Per-block response routing ─────────────────────────────────────
const respondedBlockType = computed(() => {
  const r = props.response
  if (!r) return null
  if (typeof r === 'object' && r._source) return r._source
  if (typeof r === 'string') return 'project-select'
  if (r.path) return 'file-picker'
  if (r.approved !== undefined || r.cancelled) return 'approval'
  if (Array.isArray(r)) return 'choice'
  return null
})

const responseForBlock = (blockType: string) => {
  if (!props.isDisabled || !props.response) return props.response
  if (!respondedBlockType.value) return props.response
  return blockType === respondedBlockType.value ? props.response : null
}

// ─── Event handlers ─────────────────────────────────────────────────
const handleBlockResponse = (response: any) => {
  threadsActor.send({
    type: 'RESPOND_TO_BLOCK_INTERACTION',
    messageId: props.messageId,
    response
  })
}

const handleSubmitFrom = (blockType: string) => (response: any) => {
  const toggles = togglesRef.value?.values
  if (toggles && Object.keys(toggles).length > 0) {
    handleBlockResponse({ path: response, toggles: { ...toggles }, _source: blockType })
  } else {
    handleBlockResponse(response)
  }
}

const submitHandlerCache = new Map<string, (r: any) => void>()
const getSubmitHandler = (type: string) => {
  if (!submitHandlerCache.has(type)) {
    submitHandlerCache.set(type, handleSubmitFrom(type))
  }
  return submitHandlerCache.get(type)!
}

const handleCancel = () => {
  handleBlockResponse({ cancelled: true })
}
</script>
