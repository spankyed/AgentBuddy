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
      ref="tooltipRef"
      class="tour-tooltip"
      :style="tooltipStyle"
    >
      <div class="tour-header">
        <h3>{{ currentStep.title }}</h3>
        <button title="End Tour" @click="endTour" class="tour-close">×</button>
      </div>
      
      <div class="tour-body">
        <p>{{ currentStep.content }}</p>
      </div>
      
      <div class="tour-footer">
        <div class="tour-progress">
          <span>{{ stepNumber }} of {{ totalSteps }}</span>
        </div>
        
        <div class="tour-actions">
          <!-- <button 
            @click="endTour"
            class="tour-btn tour-btn-ghost"
          >
            End Tour
          </button> -->
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import type { TourStep } from '@/core/actors/tour-steps';

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
const tooltipRef = ref<HTMLElement | null>(null);

// Cache window dimensions to avoid frequent DOM reads
const windowDimensions = ref({ width: window.innerWidth, height: window.innerHeight });

const tooltipStyle = computed(() => {
  // Use fixed dimensions to avoid getBoundingClientRect calls in computed
  const tooltipWidth = 450;
  const tooltipHeight = 250;
  const padding = 20;
  
  const windowWidth = windowDimensions.value.width;
  const windowHeight = windowDimensions.value.height;
  
  // Center tooltip if no target
  if (!targetRect.value) {
    return {
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%)',
    };
  }
  
  let x = 0;
  let y = 0;
  const position = props.currentStep?.tooltipPosition || 'auto';
  
  // Calculate position based on hint
  switch (position) {
    case 'left':
      // Position to the left of element
      x = targetRect.value.left - tooltipWidth - padding;
      y = targetRect.value.top + targetRect.value.height / 2 - tooltipHeight / 2;
      
      // For very tall elements, center vertically in viewport
      if (targetRect.value.height > windowHeight * 0.7) {
        y = windowHeight / 2 - tooltipHeight / 2;
      }
      
      // Fallback if off-screen
      if (x < padding) {
        // Try right instead
        x = targetRect.value.right + padding;
        if (x + tooltipWidth > windowWidth - padding) {
          // Center horizontally as last resort
          x = windowWidth / 2 - tooltipWidth / 2;
        }
      }
      break;
      
    case 'right':
      // Position to the right of element
      x = targetRect.value.right + padding;
      y = targetRect.value.top + targetRect.value.height / 2 - tooltipHeight / 2;
      
      // For very tall elements (like toolbar), center vertically in viewport
      if (targetRect.value.height > windowHeight * 0.7) {
        y = windowHeight / 2 - tooltipHeight / 2;
      }
      
      // Fallback if off-screen
      if (x + tooltipWidth > windowWidth - padding) {
        // Try left instead
        x = targetRect.value.left - tooltipWidth - padding;
        if (x < padding) {
          // Center horizontally as last resort
          x = windowWidth / 2 - tooltipWidth / 2;
        }
      }
      break;
      
    case 'top':
      // Position above element
      x = targetRect.value.left + targetRect.value.width / 2 - tooltipWidth / 2;
      y = targetRect.value.top - tooltipHeight - padding;
      
      // Fallback if off-screen
      if (y < padding) {
        // Try bottom instead
        y = targetRect.value.bottom + padding;
        if (y + tooltipHeight > windowHeight - padding) {
          // Center vertically as last resort
          y = windowHeight / 2 - tooltipHeight / 2;
        }
      }
      break;
      
    case 'bottom':
      // Position below element
      x = targetRect.value.left + targetRect.value.width / 2 - tooltipWidth / 2;
      y = targetRect.value.bottom + padding;
      
      // Fallback if off-screen
      if (y + tooltipHeight > windowHeight - padding) {
        // Try top instead
        y = targetRect.value.top - tooltipHeight - padding;
        if (y < padding) {
          // Center vertically as last resort
          y = windowHeight / 2 - tooltipHeight / 2;
        }
      }
      break;
      
    case 'auto':
    default:
      // Smart positioning: prefer bottom, then top, then right, then left
      x = targetRect.value.left + targetRect.value.width / 2 - tooltipWidth / 2;
      y = targetRect.value.bottom + padding;
      
      // If would go off bottom, try top
      if (y + tooltipHeight > windowHeight - padding) {
        y = targetRect.value.top - tooltipHeight - padding;
        
        // If still off screen, center vertically
        if (y < padding) {
          y = windowHeight / 2 - tooltipHeight / 2;
        }
      }
      break;
  }
  
  // Always keep tooltip within horizontal bounds for auto positioning
  if (position === 'auto' || position === 'top' || position === 'bottom') {
    x = Math.max(padding, Math.min(x, windowWidth - tooltipWidth - padding));
  }
  
  // Always keep tooltip within vertical bounds for left/right positioning
  if (position === 'left' || position === 'right') {
    y = Math.max(padding, Math.min(y, windowHeight - tooltipHeight - padding));
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
    // First scroll the element into view instantly
    element.scrollIntoView({ behavior: 'instant', block: 'center' });
    
    // Then measure its position
    targetRect.value = element.getBoundingClientRect();
  } else {
    targetRect.value = null;
  }
};

const nextStep = () => emit('next');
const previousStep = () => emit('previous');
const endTour = () => emit('end');
const completeTour = () => emit('complete');

// Handle keyboard navigation
const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'ArrowLeft' && !props.isFirstStep) {
    previousStep();
  } else if (event.key === 'ArrowRight') {
    if (!props.isLastStep) {
      nextStep();
    } else {
      completeTour();
    }
  }
};

// Update window dimensions on resize
const handleResize = () => {
  windowDimensions.value = { width: window.innerWidth, height: window.innerHeight };
  updateTargetRect();
};

// Update target when step changes
watch(() => props.currentStep, () => {
  updateTargetRect();
});

// Initial setup and resize handling
onMounted(() => {
  updateTargetRect();
  window.addEventListener('resize', handleResize);
  window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
  window.removeEventListener('keydown', handleKeydown);
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
  background: rgba(0, 0, 0, 0.6);
  pointer-events: auto;
}

.tour-backdrop-section {
  position: absolute;
  background: rgba(0, 0, 0, 0.6);
  pointer-events: auto;
  transition: opacity 0.15s ease;
}

.tour-spotlight-border {
  position: absolute;
  border: 2px solid rgba(74, 158, 255, 0.5);
  border-radius: 8px;
  box-shadow: 
    0 0 10px rgba(74, 158, 255, 0.4),
    inset 0 0 10px rgba(74, 158, 255, 0.2);
  pointer-events: none;
  animation: pulse 2s infinite;
  transition: transform 0.15s ease, opacity 0.15s ease;
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
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  pointer-events: auto;
  z-index: 10001;
  transition: transform 0.15s ease, opacity 0.15s ease;
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
  transition: background-color 0.15s ease, color 0.15s ease;
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
  transition: background-color 0.15s ease, transform 0.15s ease;
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

.tour-btn-ghost {
  padding: 0.5rem 1.25rem;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  color: #999;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.tour-btn-ghost:hover {
  background: #404040;
  color: white;
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