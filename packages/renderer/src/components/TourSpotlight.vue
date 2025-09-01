<template>
  <div class="tour-overlay">
    <!-- Always use multi-div overlay approach for consistency -->
    <template v-if="spotlightRect">
      <!-- Top overlay -->
      <div 
        v-if="spotlightRect.top > 0"
        class="tour-backdrop-section"
        :style="{
          top: 0,
          left: 0,
          right: 0,
          height: `${Math.max(0, spotlightRect.top)}px`
        }"
        @click="handleBackdropClick"
      ></div>
      
      <!-- Left overlay -->
      <div 
        v-if="spotlightRect.left > 0"
        class="tour-backdrop-section"
        :style="{
          top: `${Math.max(0, spotlightRect.top)}px`,
          left: 0,
          width: `${Math.max(0, spotlightRect.left)}px`,
          height: `${spotlightRect.height}px`
        }"
        @click="handleBackdropClick"
      ></div>
      
      <!-- Right overlay -->
      <div 
        class="tour-backdrop-section"
        :style="{
          top: `${Math.max(0, spotlightRect.top)}px`,
          right: 0,
          left: `${spotlightRect.left + spotlightRect.width}px`,
          height: `${spotlightRect.height}px`
        }"
        @click="handleBackdropClick"
      ></div>
      
      <!-- Bottom overlay -->
      <div 
        class="tour-backdrop-section"
        :style="{
          top: `${spotlightRect.top + spotlightRect.height}px`,
          left: 0,
          right: 0,
          bottom: 0
        }"
        @click="handleBackdropClick"
      ></div>
      
      <!-- Spotlight border/glow effect (only show if there's a real target) -->
      <div 
        v-if="targetRect"
        class="tour-spotlight-border"
        :style="{
          top: `${spotlightRect.top}px`,
          left: `${spotlightRect.left}px`,
          width: `${spotlightRect.width}px`,
          height: `${spotlightRect.height}px`
        }"
      ></div>
    </template>
    
    <!-- Tour content tooltip -->
    <div 
      v-if="currentStep"
      ref="tooltipRef"
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
    
    <!-- Persistent End Tour button -->
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
const tooltipPosition = ref({ x: 0, y: 0 });
const tooltipRef = ref<HTMLElement | null>(null);
const tooltipActualHeight = ref(300); // Default height, will be updated dynamically

// Computed property for spotlight rect - creates virtual full-screen when no target
const spotlightRect = computed(() => {
  if (targetRect.value) {
    const padding = 2;

    // Use actual target rect with appropriate padding
    return {
      top: Math.max(0, targetRect.value.top - padding),
      left: Math.max(0, targetRect.value.left - padding),
      width: targetRect.value.width + (padding * 2),
      height: targetRect.value.height + (padding * 2),
    };
  } else {
    // Create a virtual full-screen spotlight (basically no visible spotlight)
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    return {
      top: windowHeight / 2 - 1,
      left: windowWidth / 2 - 1,
      width: 2,
      height: 2,
    };
  }
});

const tooltipStyle = computed(() => {
  if (!targetRect.value) {
    // Center tooltip if no target
    return {
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%)',
    };
  }
  
  const tooltipWidth = 400;
  const tooltipHeight = tooltipActualHeight.value; // Use dynamically measured height
  const offset = 20;
  
  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;
  
  // Check if element is very tall (more than 50% of viewport)
  const isFullHeight = targetRect.value.height > windowHeight * 0.5;
  
  // Special positioning for toolbar and other full-height elements
  if (isFullHeight || props.currentStep?.targetId === 'toolbar') {
    // Position to the right of the element, vertically centered
    let x = targetRect.value.right + offset;
    let y = windowHeight / 2 - tooltipHeight / 2;
    
    // If no room on the right, try positioning in the center of the viewport
    if (x + tooltipWidth > windowWidth - offset) {
      x = windowWidth / 2 - tooltipWidth / 2;
      y = windowHeight / 2 - tooltipHeight / 2;
    }
    
    return {
      left: `${x}px`,
      top: `${y}px`,
    };
  }
  
  // Normal positioning for regular elements
  let x = targetRect.value.left + targetRect.value.width / 2 - tooltipWidth / 2;
  let y = targetRect.value.bottom + offset;
  
  // Adjust horizontal position if tooltip goes off screen
  if (x < offset) x = offset;
  if (x + tooltipWidth > windowWidth - offset) {
    x = windowWidth - tooltipWidth - offset;
  }
  
  // Adjust vertical position if tooltip goes off bottom
  if (y + tooltipHeight > windowHeight - offset) {
    // Try positioning above target
    y = targetRect.value.top - tooltipHeight - offset;
    
    // If still off screen (element too high), center vertically
    if (y < offset) {
      y = windowHeight / 2 - tooltipHeight / 2;
    }
  }
  
  return {
    left: `${x}px`,
    top: `${y}px`,
  };
});

const measureTooltipHeight = () => {
  if (tooltipRef.value) {
    const rect = tooltipRef.value.getBoundingClientRect();
    tooltipActualHeight.value = rect.height;
    console.log('[Tour] Measured tooltip height:', rect.height);
  }
};

const updateTargetRect = () => {
  if (!props.currentStep) {
    console.log('[Tour] No current step');
    targetRect.value = null;
    return;
  }
  
  // Check if targetId is empty or not provided
  if (!props.currentStep.targetId || props.currentStep.targetId === '') {
    console.log('[Tour] No target ID specified for this step');
    targetRect.value = null;
    return;
  }
  
  console.log('[Tour] Looking for element with id:', props.currentStep.targetId);
  const element = document.querySelector(`[data-onboarding-id="${props.currentStep.targetId}"]`) as HTMLElement;
  
  if (element) {
    console.log('[Tour] Found element:', element);
    targetRect.value = element.getBoundingClientRect();
    console.log('[Tour] Element rect:', targetRect.value);

    // Scroll element into view if needed
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } else {
    console.log('[Tour] Element not found!');
    targetRect.value = null;
  }
};

const handleBackdropClick = () => {
  // Prevent closing tour on backdrop click
};

const nextStep = () => {
  emit('next');
};

const previousStep = () => {
  emit('previous');
};

const endTour = () => {
  emit('end');
};

const completeTour = () => {
  emit('complete');
};

// Update target rect when step changes
watch(() => props.currentStep, async () => {
  // Wait for DOM updates before trying to find the element
  await nextTick();
  // Add a small delay to ensure everything is rendered
  setTimeout(() => {
    updateTargetRect();
    measureTooltipHeight();
  }, 100);
});

// Update target rect on window resize
onMounted(async () => {
  window.addEventListener('resize', updateTargetRect);
  // Wait for DOM to be fully ready
  await nextTick();
  // Add a small delay to ensure everything is rendered
  setTimeout(() => {
    updateTargetRect();
    measureTooltipHeight();
  }, 200);
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
  transition: all 0.3s ease;
}

.tour-tooltip {
  position: absolute;
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 12px;
  padding: 1.5rem;
  min-width: 400px;
  max-width: 500px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
  pointer-events: auto;
  z-index: 10001; /* Ensure tooltip is always above everything */
  transition: left 0.3s ease, top 0.3s ease; /* Smooth position transitions */
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
  z-index: 3;
}

.tour-end-button:hover {
  background: rgba(220, 38, 38, 0.9);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
}
</style>