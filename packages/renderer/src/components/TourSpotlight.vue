<template>
  <div class="tour-overlay">
    <!-- Show multi-div backdrop when element is targeted -->
    <template v-if="targetRect">
      <!-- Top overlay -->
      <div 
        class="tour-backdrop-section"
        :style="{
          top: 0,
          left: 0,
          right: 0,
          height: `${targetRect.top}px`
        }"
      ></div>
      
      <!-- Left overlay -->
      <div 
        class="tour-backdrop-section"
        :style="{
          top: `${targetRect.top}px`,
          left: 0,
          width: `${targetRect.left}px`,
          height: `${targetRect.height}px`
        }"
      ></div>
      
      <!-- Right overlay -->
      <div 
        class="tour-backdrop-section"
        :style="{
          top: `${targetRect.top}px`,
          right: 0,
          left: `${targetRect.left + targetRect.width}px`,
          height: `${targetRect.height}px`
        }"
      ></div>
      
      <!-- Bottom overlay -->
      <div 
        class="tour-backdrop-section"
        :style="{
          top: `${targetRect.top + targetRect.height}px`,
          left: 0,
          right: 0,
          bottom: 0
        }"
      ></div>
      
      <!-- Spotlight border -->
      <div 
        class="tour-spotlight-border"
        :style="{
          top: `${targetRect.top}px`,
          left: `${targetRect.left}px`,
          width: `${targetRect.width}px`,
          height: `${targetRect.height}px`
        }"
      ></div>
    </template>
    
    <!-- Simple full backdrop when no target -->
    <div v-else class="tour-backdrop"></div>
    
    <!-- Tour tooltip -->
    <div 
      v-if="currentStep"
      class="tour-tooltip"
      :style="tooltipStyle"
    >
      <div class="tour-header">
        <h3>{{ currentStep.title }}</h3>
        <button @click="endTour" class="tour-close">×</button>
      </div>
      
      <div class="tour-body">
        <p>{{ currentStep.content }}</p>
      </div>
      
      <div class="tour-footer">
        <div class="tour-progress">
          <span>{{ stepNumber }} of {{ totalSteps }}</span>
        </div>
        
        <div class="tour-actions">
          <button 
            v-if="!isFirstStep"
            @click="previousStep"
            class="tour-btn tour-btn-secondary"
          >
            Previous
          </button>
          <button 
            v-if="!isLastStep"
            @click="nextStep"
            class="tour-btn tour-btn-primary"
          >
            Next
          </button>
          <button 
            v-else
            @click="completeTour"
            class="tour-btn tour-btn-success"
          >
            Finish Tour
          </button>
        </div>
      </div>
    </div>
    
    <!-- End Tour button -->
    <button 
      class="tour-end-button"
      @click="endTour"
    >
      End Tour
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';

export interface TourStep {
  id: string;
  targetId: string;
  title: string;
  content: string;
  action?: () => void;
}

const props = defineProps<{
  currentStep: TourStep | null;
  stepNumber: number;
  totalSteps: number;
  isFirstStep: boolean;
  isLastStep: boolean;
}>();

const emit = defineEmits<{
  next: [];
  previous: [];
  end: [];
  complete: [];
}>();

const targetRect = ref<DOMRect | null>(null);

const tooltipStyle = computed(() => {
  const tooltipWidth = 400;
  const tooltipHeight = 250; // Fixed reasonable height
  const padding = 20;
  
  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;
  
  // Center tooltip if no target
  if (!targetRect.value) {
    return {
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%)',
    };
  }
  
  // Special positioning for toolbar (full-height element on the left)
  if (props.currentStep?.targetId === 'toolbar') {
    const x = targetRect.value.right + padding;
    const y = windowHeight / 2 - tooltipHeight / 2;
    
    return {
      left: `${x}px`,
      top: `${y}px`,
    };
  }
  
  // Default positioning: below the target element
  let x = targetRect.value.left + targetRect.value.width / 2 - tooltipWidth / 2;
  let y = targetRect.value.bottom + padding;
  
  // Keep tooltip within viewport horizontally
  x = Math.max(padding, Math.min(x, windowWidth - tooltipWidth - padding));
  
  // If tooltip would go off bottom, position above target
  if (y + tooltipHeight > windowHeight - padding) {
    y = targetRect.value.top - tooltipHeight - padding;
    
    // If still off screen, center vertically
    if (y < padding) {
      y = windowHeight / 2 - tooltipHeight / 2;
    }
  }
  
  return {
    left: `${x}px`,
    top: `${y}px`,
  };
});

const updateTargetRect = async () => {
  if (!props.currentStep?.targetId) {
    targetRect.value = null;
    return;
  }
  
  await nextTick();
  
  const element = document.querySelector(`[data-onboarding-id="${props.currentStep.targetId}"]`);
  if (element) {
    targetRect.value = element.getBoundingClientRect();
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } else {
    targetRect.value = null;
  }
};

const nextStep = () => emit('next');
const previousStep = () => emit('previous');
const endTour = () => emit('end');
const completeTour = () => emit('complete');

// Update target when step changes
watch(() => props.currentStep, () => {
  updateTargetRect();
});

// Initial setup and resize handling
onMounted(() => {
  updateTargetRect();
  window.addEventListener('resize', updateTargetRect);
});

onUnmounted(() => {
  window.removeEventListener('resize', updateTargetRect);
});
</script>

<style scoped>
.tour-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 10000;
  pointer-events: none;
}

.tour-backdrop {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  pointer-events: auto;
}

.tour-backdrop-section {
  position: absolute;
  background: rgba(0, 0, 0, 0.5);
  pointer-events: auto;
}

.tour-spotlight-border {
  position: absolute;
  border: 2px solid rgba(74, 158, 255, 0.5);
  border-radius: 8px;
  box-shadow: 
    0 0 20px rgba(74, 158, 255, 0.5),
    inset 0 0 20px rgba(74, 158, 255, 0.2);
  pointer-events: none;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.7;
  }
}

.tour-tooltip {
  position: absolute;
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 12px;
  padding: 1.5rem;
  min-width: 400px;
  max-width: 500px;
  max-height: 350px;
  overflow-y: auto;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
  pointer-events: auto;
  z-index: 10001;
  transition: all 0.3s ease;
}

.tour-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.tour-header h3 {
  margin: 0;
  color: #fff;
  font-size: 1.25rem;
  font-weight: 600;
}

.tour-close {
  background: none;
  border: none;
  color: #666;
  font-size: 1.5rem;
  cursor: pointer;
  padding: 0;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s;
}

.tour-close:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #999;
}

.tour-body {
  margin-bottom: 1.5rem;
}

.tour-body p {
  margin: 0;
  color: #ccc;
  line-height: 1.6;
}

.tour-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.tour-progress {
  color: #666;
  font-size: 0.875rem;
}

.tour-actions {
  display: flex;
  gap: 0.75rem;
}

.tour-btn {
  padding: 0.5rem 1.25rem;
  border-radius: 6px;
  border: none;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.tour-btn-primary {
  background: #4a9eff;
  color: white;
}

.tour-btn-primary:hover {
  background: #3a8eef;
}

.tour-btn-secondary {
  background: #404040;
  color: white;
}

.tour-btn-secondary:hover {
  background: #505050;
}

.tour-btn-success {
  background: #10b981;
  color: white;
}

.tour-btn-success:hover {
  background: #059669;
}

.tour-end-button {
  position: fixed;
  top: 20px;
  right: 20px;
  padding: 0.5rem 1.25rem;
  background: rgba(239, 68, 68, 0.9);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  pointer-events: auto;
  z-index: 10002;
}

.tour-end-button:hover {
  background: rgba(220, 38, 38, 0.9);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
}

/* Custom scrollbar for tooltip */
.tour-tooltip::-webkit-scrollbar {
  width: 6px;
}

.tour-tooltip::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 3px;
}

.tour-tooltip::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
}

.tour-tooltip::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}
</style>