<template>
  <div class="choice-input space-y-3">
    <!-- Response Display (when disabled/responded) -->
    <div v-if="disabled && response" class="space-y-2">
      <div class="flex items-center gap-2 text-sm text-neutral-400 mb-2">
        <Check class="w-4 h-4 text-green-500" />
        <span>{{ displayText || 'Selected:' }}</span>
      </div>
      <div class="px-3 py-2 bg-primary-600/15 rounded-lg border border-primary-600/30">
        <span class="text-sm text-primary-400">{{ choiceText }}</span>
      </div>
    </div>

    <!-- Input Controls (when not disabled/not responded) -->
    <template v-else>
      <!-- Wizard step indicator (multi-question only) -->
      <div v-if="isWizard" class="flex items-center gap-2 mb-1">
        <div
          v-for="(_, i) in wizardQuestions"
          :key="i"
          :class="[
            'w-2 h-2 rounded-full transition-all',
            i < currentStep ? 'bg-primary-500'
              : i === currentStep ? 'bg-primary-400 ring-2 ring-primary-400/40'
              : 'bg-neutral-600'
          ]"
        />
        <span class="text-xs text-neutral-500 ml-1">{{ currentStep + 1 }} / {{ wizardQuestions.length }}</span>
      </div>

      <!-- Current question header (wizard mode) -->
      <div v-if="isWizard" class="text-sm text-neutral-300 mb-2">
        {{ currentQuestion.question }}
      </div>

      <!-- Choices -->
      <div class="space-y-2">
        <div
          v-for="choice in activeChoices"
          :key="choice.id"
          @click="!disabled && toggleChoice(choice.id)"
          :class="[
            'px-4 py-3 rounded-lg border transition-all duration-200',
            disabled
              ? 'cursor-not-allowed opacity-50'
              : 'cursor-pointer',
            isSelected(choice.id)
              ? 'bg-primary-600/20 border-primary-600 ring-2 ring-primary-600/50'
              : disabled
                ? 'bg-neutral-700/30 border-neutral-700'
                : 'bg-neutral-700/50 border-neutral-600 hover:border-neutral-500'
          ]"
        >
          <div class="flex items-start gap-3">
            <!-- Radio/Checkbox Icon -->
            <div
              :class="[
                'flex-shrink-0 w-5 h-5 rounded transition-all',
                activeMultiSelect ? 'rounded-md' : 'rounded-full',
                isSelected(choice.id)
                  ? 'bg-primary-600 border-2 border-primary-600'
                  : 'bg-neutral-600 border-2 border-neutral-500'
              ]"
            >
              <div
                v-if="isSelected(choice.id)"
                class="w-full h-full flex items-center justify-center"
              >
                <Check class="w-3 h-3 text-white" />
              </div>
            </div>

            <!-- Choice Content -->
            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium text-neutral-200">
                {{ choice.label }}
              </div>
              <div v-if="choice.description" class="text-xs text-neutral-400 mt-1">
                {{ choice.description }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Custom Input (if allowed) -->
      <div v-if="allowCustom" class="space-y-2">
        <div class="text-xs text-neutral-400">Or enter custom response:</div>
        <input
          v-model="customInput"
          type="text"
          :disabled="disabled"
          placeholder="Type your custom response..."
          :class="[
            'w-full px-3 py-2 border rounded-lg text-sm placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-transparent',
            disabled
              ? 'bg-neutral-700/50 border-neutral-700 text-neutral-500 cursor-not-allowed'
              : 'bg-neutral-700 border-neutral-600 text-neutral-200'
          ]"
          @keyup.enter="!disabled && handleNext()"
        />
      </div>

      <!-- Action Buttons -->
      <div v-if="isWizard || multiSelect" class="flex items-center gap-2">
        <button
          v-if="isWizard && currentStep > 0"
          @click="prevStep"
          class="px-3 py-1.5 text-sm rounded-md bg-neutral-700 hover:bg-neutral-600 text-neutral-300 transition-colors"
        >
          Back
        </button>
        <div class="flex-1" />
        <button
          @click="handleCancel"
          class="px-3 py-1.5 text-sm rounded-md bg-neutral-700 hover:bg-neutral-600 text-neutral-300 transition-colors"
        >
          Cancel
        </button>
        <button
          :disabled="!canSubmitStep"
          @click="handleNext"
          :class="[
            'px-3 py-1.5 text-sm rounded-md transition-colors',
            canSubmitStep
              ? 'bg-primary-600 hover:bg-primary-500 text-white'
              : 'bg-neutral-700 text-neutral-500 cursor-not-allowed'
          ]"
        >
          {{ isLastStep ? 'Submit' : 'Next' }}
        </button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Check } from 'lucide-vue-next'

interface Choice {
  id: string
  label: string
  description?: string
}

interface WizardQuestion {
  question: string
  header: string
  options: Choice[]
  multiSelect: boolean
}

interface Props {
  choices: Choice[]
  multiSelect?: boolean
  allowCustom?: boolean
  modelValue?: string | string[]
  disabled?: boolean
  response?: any
  displayText?: string
  /** Multi-question wizard data — if present with >1 items, renders step wizard. */
  questions?: WizardQuestion[]
}

interface Emits {
  (e: 'update:modelValue', value: string | string[]): void
  (e: 'submit', value: string | string[] | Record<string, string>): void
  (e: 'cancel'): void
}

const props = withDefaults(defineProps<Props>(), {
  multiSelect: false,
  allowCustom: false,
  disabled: false,
})

const emit = defineEmits<Emits>()

// ─── Wizard state ────────────────────────────────────────────────
const wizardQuestions = computed(() => props.questions ?? [])
const isWizard = computed(() => wizardQuestions.value.length > 1)
const currentStep = ref(0)
const wizardAnswers = ref<Record<string, string>>({})

const currentQuestion = computed(() =>
  isWizard.value ? wizardQuestions.value[currentStep.value] : null
)
const isLastStep = computed(() =>
  !isWizard.value || currentStep.value >= wizardQuestions.value.length - 1
)

// Active choices/multiSelect change per wizard step
const activeChoices = computed(() =>
  isWizard.value ? (currentQuestion.value?.options ?? []) : props.choices
)
const activeMultiSelect = computed(() =>
  isWizard.value ? (currentQuestion.value?.multiSelect ?? false) : props.multiSelect
)

// Response display handling
const choiceText = computed(() => {
  if (!props.response) return ''
  if (typeof props.response === 'object' && !Array.isArray(props.response)) {
    if (props.response.cancelled) return 'Skipped'
    // Multi-question: show all answers
    const entries = Object.entries(props.response)
    if (entries.length > 1) return entries.map(([, v]) => String(v)).join(', ')
    return props.response.value ?? JSON.stringify(props.response)
  }
  if (Array.isArray(props.response)) return props.response.join(', ')
  return String(props.response)
})

// ─── Selection state (per step) ──────────────────────────────────
const selectedChoiceIds = ref<string[]>(
  props.modelValue
    ? (Array.isArray(props.modelValue) ? props.modelValue : [props.modelValue])
    : []
)
const customInput = ref('')

const isSelected = (choiceId: string): boolean => {
  return selectedChoiceIds.value.includes(choiceId)
}

const toggleChoice = (choiceId: string) => {
  if (activeMultiSelect.value) {
    const index = selectedChoiceIds.value.indexOf(choiceId)
    if (index > -1) {
      selectedChoiceIds.value.splice(index, 1)
    } else {
      selectedChoiceIds.value.push(choiceId)
    }
  } else {
    selectedChoiceIds.value = [choiceId]
  }
  customInput.value = ''
  emitUpdate()

  // Auto-submit for single-select non-wizard
  if (!activeMultiSelect.value && !props.disabled && !isWizard.value) {
    submitResponse()
  }
}

const canSubmitStep = computed(() => {
  return selectedChoiceIds.value.length > 0 || (props.allowCustom && customInput.value.trim().length > 0)
})

// ─── Navigation ──────────────────────────────────────────────────
function getCurrentAnswer(): string {
  if (customInput.value.trim()) return customInput.value.trim()
  if (activeMultiSelect.value) return selectedChoiceIds.value.join(', ')
  return selectedChoiceIds.value[0] || ''
}

function handleNext() {
  if (!canSubmitStep.value) return

  if (isWizard.value && !isLastStep.value) {
    // Store answer for current step, advance to next
    const q = currentQuestion.value
    if (q) wizardAnswers.value[q.question] = getCurrentAnswer()
    currentStep.value++
    // Reset selection for next step
    selectedChoiceIds.value = []
    customInput.value = ''
  } else {
    // Final step or single question — submit
    if (isWizard.value) {
      // Store last answer then submit all
      const q = currentQuestion.value
      if (q) wizardAnswers.value[q.question] = getCurrentAnswer()
      emit('submit', { ...wizardAnswers.value })
    } else {
      submitResponse()
    }
  }
}

function prevStep() {
  if (currentStep.value > 0) {
    currentStep.value--
    // Restore previous answer
    const q = wizardQuestions.value[currentStep.value]
    const prevAnswer = q ? wizardAnswers.value[q.question] : ''
    selectedChoiceIds.value = prevAnswer ? [prevAnswer] : []
    customInput.value = ''
  }
}

function handleCancel() {
  emit('cancel')
}

const submitResponse = () => {
  if (!canSubmitStep.value) return

  let response: string | string[]

  if (customInput.value.trim()) {
    response = customInput.value.trim()
  } else if (props.multiSelect) {
    response = selectedChoiceIds.value
  } else {
    response = selectedChoiceIds.value[0] || ''
  }

  emit('submit', response)
}

const emitUpdate = () => {
  let value: string | string[]

  if (activeMultiSelect.value) {
    value = selectedChoiceIds.value
  } else {
    value = selectedChoiceIds.value[0] || ''
  }

  emit('update:modelValue', value)
}
</script>
