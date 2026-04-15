<template>
  <div class="question-input space-y-3">
    <!-- Response Display (when disabled/responded) -->
    <div v-if="disabled && response" class="space-y-2">
      <div class="flex items-center gap-2 text-sm text-neutral-400 mb-2">
        <Check class="w-4 h-4 text-green-500" />
        <span>Answered</span>
      </div>
      <div class="px-3 py-2 bg-primary-600/15 rounded-lg border border-primary-600/30">
        <span class="text-sm text-primary-400">{{ responseDisplay }}</span>
      </div>
    </div>

    <!-- Input Controls -->
    <template v-else>
      <!-- Step indicator (multi-question) -->
      <div v-if="isWizard" class="flex items-center gap-2 mb-1">
        <div
          v-for="(_, i) in questions"
          :key="i"
          :class="[
            'w-2 h-2 rounded-full transition-all',
            i < currentStep ? 'bg-primary-500'
              : i === currentStep ? 'bg-primary-400 ring-2 ring-primary-400/40'
              : 'bg-neutral-600'
          ]"
        />
        <span class="text-xs text-neutral-500 ml-1">{{ currentStep + 1 }} / {{ questions.length }}</span>
      </div>

      <!-- Current question text -->
      <div class="text-sm text-neutral-300 mb-2">
        {{ currentQ.question }}
      </div>

      <!-- Choices for current question -->
      <div class="space-y-2">
        <div
          v-for="choice in currentQ.options"
          :key="choice.id"
          @click="!disabled && toggleChoice(choice.id)"
          :class="[
            'px-4 py-3 rounded-lg border transition-all duration-200',
            disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
            isSelected(choice.id)
              ? 'bg-primary-600/20 border-primary-600 ring-2 ring-primary-600/50'
              : 'bg-neutral-700/50 border-neutral-600 hover:border-neutral-500'
          ]"
        >
          <div class="flex items-start gap-3">
            <div :class="[
              'flex-shrink-0 w-5 h-5 rounded transition-all',
              currentQ.multiSelect ? 'rounded-md' : 'rounded-full',
              isSelected(choice.id)
                ? 'bg-primary-600 border-2 border-primary-600'
                : 'bg-neutral-600 border-2 border-neutral-500'
            ]">
              <div v-if="isSelected(choice.id)" class="w-full h-full flex items-center justify-center">
                <Check class="w-3 h-3 text-white" />
              </div>
            </div>
            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium text-neutral-200">{{ choice.label }}</div>
              <div v-if="choice.description" class="text-xs text-neutral-400 mt-1">{{ choice.description }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Custom input -->
      <div v-if="currentQ.allowCustom !== false" class="space-y-2">
        <div class="text-xs text-neutral-400">Or enter custom response:</div>
        <input
          v-model="customInput"
          type="text"
          :disabled="disabled"
          placeholder="Type your response..."
          class="w-full px-3 py-2 border rounded-lg text-sm placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-transparent bg-neutral-700 border-neutral-600 text-neutral-200"
          @keyup.enter="!disabled && handleNext()"
        />
      </div>

      <!-- Navigation buttons -->
      <div class="flex items-center gap-2">
        <button
          v-if="isWizard && currentStep > 0"
          @click="prevStep"
          :disabled="disabled"
          :class="[
            'px-3 py-1.5 text-sm rounded-md transition-colors',
            disabled
              ? 'bg-neutral-700/50 text-neutral-500 cursor-not-allowed opacity-50'
              : 'bg-neutral-700 hover:bg-neutral-600 text-neutral-300'
          ]"
        >Back</button>
        <div class="flex-1" />
        <button
          @click="$emit('cancel')"
          :disabled="disabled"
          :class="[
            'px-3 py-1.5 text-sm rounded-md transition-colors',
            disabled
              ? 'bg-neutral-700/50 text-neutral-500 cursor-not-allowed opacity-50'
              : 'bg-neutral-700 hover:bg-neutral-600 text-neutral-300'
          ]"
        >Cancel</button>
        <button
          :disabled="!canSubmit || disabled"
          @click="handleNext"
          :class="[
            'px-3 py-1.5 text-sm rounded-md transition-colors',
            canSubmit && !disabled
              ? 'bg-primary-600 hover:bg-primary-500 text-white'
              : 'bg-neutral-700 text-neutral-500 cursor-not-allowed'
          ]"
        >{{ isLastStep ? 'Submit' : 'Next' }}</button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Check } from 'lucide-vue-next'

interface Question {
  question: string
  header?: string
  options: Array<{ id: string; label: string; description?: string }>
  multiSelect?: boolean
  allowCustom?: boolean
}

const props = defineProps<{
  questions: Question[]
  disabled?: boolean
  response?: any
}>()

const emit = defineEmits<{
  (e: 'submit', value: string | Record<string, string>): void
  (e: 'cancel'): void
}>()

const isWizard = computed(() => props.questions.length > 1)
const currentStep = ref(0)
const answers = ref<Record<string, string>>({})
const selectedIds = ref<string[]>([])
const customInput = ref('')

const currentQ = computed(() => props.questions[currentStep.value] ?? props.questions[0])
const isLastStep = computed(() => currentStep.value >= props.questions.length - 1)

const canSubmit = computed(() =>
  selectedIds.value.length > 0 || customInput.value.trim().length > 0
)

const responseDisplay = computed(() => {
  if (!props.response) return ''
  if (typeof props.response === 'object' && !Array.isArray(props.response)) {
    if (props.response.cancelled) return 'Skipped'
    const entries = Object.values(props.response)
    return entries.length > 1 ? entries.join(', ') : String(entries[0] ?? '')
  }
  return String(props.response)
})

function isSelected(id: string) { return selectedIds.value.includes(id) }

function toggleChoice(id: string) {
  if (currentQ.value.multiSelect) {
    const i = selectedIds.value.indexOf(id)
    if (i > -1) selectedIds.value.splice(i, 1)
    else selectedIds.value.push(id)
  } else {
    selectedIds.value = [id]
    // Auto-advance for single-select (unless wizard needs explicit Next)
    if (!isWizard.value) handleNext()
  }
}

function getCurrentAnswer(): string {
  if (customInput.value.trim()) return customInput.value.trim()
  if (currentQ.value.multiSelect) return selectedIds.value.join(', ')
  return selectedIds.value[0] || ''
}

function handleNext() {
  if (!canSubmit.value) return

  if (isWizard.value && !isLastStep.value) {
    answers.value[currentQ.value.question] = getCurrentAnswer()
    currentStep.value++
    selectedIds.value = []
    customInput.value = ''
  } else if (isWizard.value) {
    answers.value[currentQ.value.question] = getCurrentAnswer()
    emit('submit', { ...answers.value })
  } else {
    emit('submit', getCurrentAnswer())
  }
}

function prevStep() {
  if (currentStep.value > 0) {
    currentStep.value--
    const prev = answers.value[currentQ.value.question]
    selectedIds.value = prev ? [prev] : []
    customInput.value = ''
  }
}
</script>
