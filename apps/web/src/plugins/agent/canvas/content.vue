<template>
  <!-- Agent Canvas Content -->
  <div class="relative max-w-4xl mx-auto">
    <div class="p-6 rounded-lg shadow-md bg-neutral-800 animate-fade-in">
      <template v-if="content.type === 'code'">
        <div class="relative">
          <pre class="p-6 overflow-x-auto font-mono text-sm text-white rounded-lg bg-neutral-900">
            <code>{{ content.content }}</code>
          </pre>
          <button 
            class="absolute p-2 transition-colors rounded top-3 right-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white"
            title="Copy to clipboard"
          >
            <Copy :size="16" />
          </button>
        </div>
      </template>
      
      <template v-else-if="content.type === 'text'">
        <div class="prose">{{ content.content }}</div>
      </template>
      
      <template v-else-if="content.type === 'image'">
        <img :src="content.content" alt="Canvas content" class="h-auto max-w-full" />
      </template>
      
      <template v-else>
        <div class="py-8 text-center text-neutral-500">No content to display</div>
      </template>
    </div>
    
    <div v-if="content.type === 'code'" class="p-4 mt-4 border rounded-lg border-neutral-300 bg-neutral-800">
      <p class="text-sm italic text-neutral-300">please rewrite this code using css variables from our design systems</p>
    </div>
    <div v-if="content.type === 'code'" class="p-4 mt-4 border rounded-lg border-neutral-300 bg-neutral-800">
      <p class="text-sm italic text-neutral-300">please rewrite this code using css variables from our design systems</p>
    </div>
  </div>
  <!-- Toggle Button -->
  <!-- <div style="display: flex; justify-content: center; position: absolute; top: 1rem; left: 0; width: 100%; z-index: 10;"> -->
  <div class="absolute z-10 ml-1 pointer-events-none top-4">
    <Button
      @click="actor.send({ type: 'VIEW_WORKLOAD' })"
      type="button"
      variant="transparent"
      :class="'pointer-events-auto mx-1 px-2 py-1 text-xs tracking-wider uppercase rounded-lg'"
    >
      View workload
    </Button>
  </div>
  <!-- <div style="position: absolute; bottom: 2rem; right: 2rem; z-index: 10;">
    <ToggleButton :active="showAll" @toggle="toggleShowAll">
      {{ showAll ? 'Show current' : 'Show all' }}
    </ToggleButton>
  </div> -->
</template>

<script setup lang="ts">
import { Copy } from 'lucide-vue-next'
import { applicationActor } from '@/application'
import { useSelector } from '@xstate/vue'
import Button from '@/shared/design/button.vue'
import { id, type AgentState } from '@/plugins/agent/state';

const actor: AgentState = applicationActor.system.get(id);
const content = useSelector(actor, (state) => state.context.canvasContent)
// const showAll = ref(false)
// function toggleShowAll() {
//   showAll.value = !showAll.value
// }

</script>

<style lang="scss" module>
</style> 