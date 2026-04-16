<template>
  <div class="relative inline-flex">
    <!-- Conjoined container for both selectors -->
    <div
      v-if="!forcedMode"
      class="inline-flex bg-neutral-800 border border-neutral-700/50 rounded-lg overflow-hidden transition-all"
    >
      <!-- Mode Selector (Left) -->
      <DropdownMenuRoot v-model:open="isModeOpen">
        <DropdownMenuTrigger as-child>
          <button
            type="button"
            :disabled="disabled"
            class="flex items-center gap-1.5 px-3 py-1.5 text-sm transition-all text-neutral-300"
            :class="modeButtonClasses"
          >
            <span class="font-medium">{{ currentModeName }}</span>
            <ChevronDown
              :size="14"
              class="transition-transform"
              :class="{ 'rotate-180': isModeOpen }"
            />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuPortal>
          <DropdownMenuContent
            align="start"
            :side-offset="8"
            class="min-w-[140px] bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl py-1 z-50"
          >
            <DropdownMenuItem
              v-for="mode in visibleModes"
              :key="mode.id"
              :disabled="mode.disabled"
              @select="handleModeSelect(mode.id)"
              class="relative flex items-center justify-between px-3 py-2 text-sm transition-colors focus:outline-none"
              :class="mode.disabled
                ? 'opacity-50 cursor-not-allowed text-neutral-500'
                : 'cursor-pointer text-neutral-200 hover:bg-neutral-800 focus:bg-neutral-800'"
            >
              <span class="font-medium">{{ mode.name }}</span>
              <Check
                v-if="currentMode === mode.id"
                :size="16"
                class="text-blue-400"
              />
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenuRoot>

      <!-- Divider (only when phases exist) -->
      <div
        v-if="hasPhases"
        class="w-px bg-neutral-700/50"
      />

      <!-- Phase Selector (Right, conditional) -->
      <DropdownMenuRoot v-if="hasPhases" v-model:open="isPhaseOpen">
        <DropdownMenuTrigger as-child>
          <button
            type="button"
            :disabled="disabled"
            class="flex items-center gap-1.5 px-3 py-1.5 text-sm transition-all text-neutral-300"
            :class="phaseButtonClasses"
            :style="phaseButtonStyle"
          >
            <span class="font-medium">{{ currentPhaseName }}</span>
            <ChevronDown
              :size="14"
              class="transition-transform"
              :class="{ 'rotate-180': isPhaseOpen }"
            />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuPortal>
          <DropdownMenuContent
            align="end"
            :side-offset="8"
            class="min-w-[140px] bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl overflow-hidden z-50"
          >
            <DropdownMenuItem
              v-for="phase in currentModePhases"
              :key="phase.id"
              @select="handlePhaseSelect(phase.id)"
              class="relative flex items-center justify-between px-3 py-2 text-sm transition-colors cursor-pointer text-neutral-200 hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none"
              :class="{ 'bg-neutral-800/50': currentPhase === phase.id }"
              :style="{ backgroundColor: phase.color ? `${phase.color}33` : undefined }"
            >
              <span class="flex items-center gap-2">
                <!-- <span
                  v-if="phase.color"
                  class="w-2 h-2 rounded-full shrink-0"
                  :style="{ backgroundColor: phase.color }"
                /> -->
                {{ phase.name }}
              </span>
              <Check
                v-if="currentPhase === phase.id"
                :size="16"
                class="text-blue-400"
              />
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenuRoot>
    </div>

    <!-- Forced mode indicator (non-interactive) -->
    <div
      v-if="forcedMode"
      class="px-3 py-1.5 text-sm font-medium rounded-lg bg-neutral-800 text-neutral-400"
    >
      {{ forcedModeName }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ChevronDown, Check } from 'lucide-vue-next'
import {
  DropdownMenuRoot,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
} from 'reka-ui'
import type { AgentMode } from '@app/api'

const props = defineProps<{
  modes: AgentMode[]
  currentMode: string
  currentPhase?: string
  forcedMode?: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  (e: 'mode-change', mode: string): void
  (e: 'phase-change', phase: string): void
}>()

const isModeOpen = ref(false)
const isPhaseOpen = ref(false)

const visibleModes = computed(() => props.modes.filter(m => !m.hidden))

const currentModeData = computed(() => {
  return props.modes.find(m => m.id === props.currentMode)
})

const currentModePhases = computed(() => {
  return currentModeData.value?.phases || []
})

const hasPhases = computed(() => {
  return currentModePhases.value.length > 0
})

const currentModeName = computed(() => {
  return currentModeData.value?.name || 'Select mode'
})

const currentPhaseName = computed(() => {
  const phase = currentModePhases.value.find(p => p.id === props.currentPhase)
  return phase?.name || 'Select phase'
})

const currentPhaseColor = computed(() => {
  const phase = currentModePhases.value.find(p => p.id === props.currentPhase)
  return phase?.color
})

// 20%-alpha tint (adds '33' to a 6-char hex) so the button reads as a soft fill
// that still lets the neutral text stay legible.
const phaseButtonStyle = computed(() => {
  const c = currentPhaseColor.value
  return c ? { backgroundColor: `${c}33` } : null
})

const forcedModeName = computed(() => {
  const mode = props.modes.find(m => m.id === props.forcedMode)
  return mode?.name || 'Birth'
})

const modeButtonClasses = computed(() => {
  const hover = !props.disabled ? 'hover:bg-neutral-750' : ''
  const disabled = props.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
  return `${hover} ${disabled}`
})

const phaseButtonClasses = computed(() => {
  const hover = !props.disabled ? 'hover:bg-neutral-750' : ''
  const disabled = props.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
  return `${hover} ${disabled}`
})

const handleModeSelect = (modeId: string) => {
  const mode = props.modes.find(m => m.id === modeId)
  if (mode?.disabled) return
  emit('mode-change', modeId)
  isModeOpen.value = false
}

const handlePhaseSelect = (phaseId: string) => {
  emit('phase-change', phaseId)
  isPhaseOpen.value = false
}
</script>
