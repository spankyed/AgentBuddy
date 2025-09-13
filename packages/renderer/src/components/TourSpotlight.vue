<template>
  <div class="tour-overlay">
    <!-- Full backdrop when no targets -->
    <div 
      v-if="targetRects.length === 0"
      class="tour-backdrop-full"
    />
    
    <!-- Backdrop with cutout when we have targets -->
    <div 
      v-else
      class="tour-backdrop-cutout"
      :style="{
        top: `${targetRects[0].rect.top}px`,
        left: `${targetRects[0].rect.left}px`,
        width: `${targetRects[0].rect.width}px`,
        height: `${targetRects[0].rect.height}px`
      }"
    />
    
    <!-- Spotlight borders for all targets -->
    <div 
      v-for="(target, index) in targetRects"
      :key="index"
      :class="['tour-spotlight', { 'tour-flash': target.flash }]"
      :style="{
        top: `${target.rect.top}px`,
        left: `${target.rect.left}px`,
        width: `${target.rect.width}px`,
        height: `${target.rect.height}px`
      }"
    />
    
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
          {{ stepNumber }} of {{ totalSteps }}
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
            @click="isLastStep ? completeTour() : nextStep()"
            :class="['tour-btn', isLastStep ? 'tour-btn-success' : 'tour-btn-primary']"
          >
            {{ isLastStep ? 'Finish Tour' : 'Next' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { useSelector } from '@xstate/vue';
import { applicationState } from '@/main';
import type { TourTarget } from '@/core/actors/tour-steps-simple';

// Get tour context from application state
const tourContext = useSelector(applicationState, (snapshot) => {
  const tourActor = snapshot.children.guidedTour;
  const tourSnapshot = tourActor?.getSnapshot();
  return tourSnapshot && 'context' in tourSnapshot ? tourSnapshot.context : null;
});

const currentStep = computed(() => {
  if (!tourContext.value) {
    return null;
  }
  const step = tourContext.value.steps[tourContext.value.currentStepIndex];
  return step;
});

const stepNumber = computed(() => {
  if (!tourContext.value) return 0;
  return tourContext.value.currentStepIndex + 1;
});

const totalSteps = computed(() => {
  if (!tourContext.value) return 0;
  return tourContext.value.steps.length;
});

const isFirstStep = computed(() => {
  if (!tourContext.value) return true;
  return tourContext.value.currentStepIndex === 0;
});

const isLastStep = computed(() => {
  if (!tourContext.value) return false;
  return tourContext.value.currentStepIndex === tourContext.value.steps.length - 1;
});

interface TargetInfo {
  rect: DOMRect;
  flash: boolean;
}

const targetRects = ref<TargetInfo[]>([]);
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
  
  // Center tooltip if no targets
  if (!targetRects.value.length) {
    return {
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%)',
    };
  }
  
  // Use the first target for positioning the tooltip
  const targetRect = targetRects.value[0].rect;
  
  let x = 0;
  let y = 0;
  const position = currentStep.value?.tooltipPosition || 'auto';
  
  // Calculate position based on hint
  switch (position) {
    case 'left':
      // Position to the left of element
      x = targetRect.left - tooltipWidth - padding;
      y = targetRect.top + targetRect.height / 2 - tooltipHeight / 2;
      
      // For very tall elements, center vertically in viewport
      if (targetRect.height > windowHeight * 0.7) {
        y = windowHeight / 2 - tooltipHeight / 2;
      }
      
      // Fallback if off-screen
      if (x < padding) {
        // Try right instead
        x = targetRect.right + padding;
        if (x + tooltipWidth > windowWidth - padding) {
          // Center horizontally as last resort
          x = windowWidth / 2 - tooltipWidth / 2;
        }
      }
      break;
      
    case 'right':
      // Position to the right of element
      x = targetRect.right + padding;
      y = targetRect.top + targetRect.height / 2 - tooltipHeight / 2;
      
      // For very tall elements (like toolbar), center vertically in viewport
      if (targetRect.height > windowHeight * 0.7) {
        y = windowHeight / 2 - tooltipHeight / 2;
      }
      
      // Fallback if off-screen
      if (x + tooltipWidth > windowWidth - padding) {
        // Try left instead
        x = targetRect.left - tooltipWidth - padding;
        if (x < padding) {
          // Center horizontally as last resort
          x = windowWidth / 2 - tooltipWidth / 2;
        }
      }
      break;
      
    case 'top':
      // Position above element
      x = targetRect.left + targetRect.width / 2 - tooltipWidth / 2;
      y = targetRect.top - tooltipHeight - padding;
      
      // Fallback if off-screen
      if (y < padding) {
        // Try bottom instead
        y = targetRect.bottom + padding;
        if (y + tooltipHeight > windowHeight - padding) {
          // Center vertically as last resort
          y = windowHeight / 2 - tooltipHeight / 2;
        }
      }
      break;
      
    case 'bottom':
      // Position below element
      x = targetRect.left + targetRect.width / 2 - tooltipWidth / 2;
      y = targetRect.bottom + padding;
      
      // Fallback if off-screen
      if (y + tooltipHeight > windowHeight - padding) {
        // Try top instead
        y = targetRect.top - tooltipHeight - padding;
        if (y < padding) {
          // Center vertically as last resort
          y = windowHeight / 2 - tooltipHeight / 2;
        }
      }
      break;
      
    case 'auto':
    default:
      // Smart positioning: prefer bottom, then top, then right, then left
      x = targetRect.left + targetRect.width / 2 - tooltipWidth / 2;
      y = targetRect.bottom + padding;
      
      // If would go off bottom, try top
      if (y + tooltipHeight > windowHeight - padding) {
        y = targetRect.top - tooltipHeight - padding;
        
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
  if (!currentStep.value?.targetId) {
    targetRects.value = [];
    return;
  }

  // Normalize targetId to array of targets
  let targets: TourTarget[] = [];
  if (Array.isArray(currentStep.value.targetId)) {
    targets = currentStep.value.targetId;
  } else {
    targets = [currentStep.value.targetId];
  }

  const rects: TargetInfo[] = [];
  
  for (const target of targets) {
    const targetId = typeof target === 'string' ? target : target.id;
    const flash = typeof target === 'object' ? target.flash === true : false;
    
    const element = document.querySelector(`[data-onboarding-id="${targetId}"]`);
    if (element) {
      // First scroll the element into view instantly (only for first element)
      if (rects.length === 0) {
        element.scrollIntoView({ behavior: 'instant', block: 'center' });
      }
      
      // Then measure its position
      rects.push({
        rect: element.getBoundingClientRect(),
        flash
      });
    }
  }
  
  targetRects.value = rects;
};

// Handle keyboard navigation
const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'ArrowLeft' && !isFirstStep.value) {
    previousStep();
  } else if (event.key === 'ArrowRight' && !isLastStep.value) {
    nextStep();
  } else if (event.key === 'Enter') {
    // Handle Enter key based on current step
    if (!isLastStep.value) {
      nextStep();
    } else {
      // On last step, Enter completes the tour
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
watch(() => currentStep.value, async () => {
  await nextTick();
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

// Tour controls - send events through application state for proper reactivity
const nextStep = () => {
  applicationState.send({ type: 'TOUR_NEXT' });
};

const previousStep = () => {
  applicationState.send({ type: 'TOUR_PREVIOUS' });
};

const endTour = () => {
  applicationState.send({ type: 'TOUR_END' });
};

const completeTour = () => {
  applicationState.send({ type: 'TOUR_COMPLETE' });
};
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

.tour-backdrop-full {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  pointer-events: auto;
}

.tour-backdrop-cutout {
  position: fixed;
  pointer-events: auto;
  /* Massive box-shadow creates the backdrop with a hole */
  box-shadow: 0 0 0 10000px rgba(0, 0, 0, 0.6);
}

.tour-spotlight {
  position: fixed;
  border: 2px solid rgba(74, 158, 255, 0.5);
  border-radius: 8px;
  box-shadow: 
    0 0 10px rgba(74, 158, 255, 0.4),
    inset 0 0 10px rgba(74, 158, 255, 0.2);
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

@keyframes flash {
  0%, 100% {
    opacity: 1;
    box-shadow: 
      0 0 20px rgba(74, 158, 255, 0.8),
      0 0 40px rgba(74, 158, 255, 0.6),
      inset 0 0 20px rgba(74, 158, 255, 0.4);
  }
  25% {
    opacity: 0.5;
    box-shadow: 
      0 0 10px rgba(74, 158, 255, 0.4),
      inset 0 0 10px rgba(74, 158, 255, 0.2);
  }
  50% {
    opacity: 1;
    box-shadow: 
      0 0 30px rgba(255, 255, 255, 0.8),
      0 0 60px rgba(74, 158, 255, 1),
      inset 0 0 30px rgba(74, 158, 255, 0.6);
  }
  75% {
    opacity: 0.5;
    box-shadow: 
      0 0 10px rgba(74, 158, 255, 0.4),
      inset 0 0 10px rgba(74, 158, 255, 0.2);
  }
}

.tour-flash {
  animation: flash 1.5s infinite !important;
  border-color: rgba(74, 158, 255, 0.8) !important;
  border-width: 3px !important;
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