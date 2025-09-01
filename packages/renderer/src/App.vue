<script setup lang="ts">
import WebApp from './WebApp.vue';
import ApiStatus from './components/ApiStatus.vue';
import Onboarding from './components/Onboarding.vue';
import TourSpotlight from './components/TourSpotlight.vue';
import { ref, computed } from 'vue';
import { applicationState } from '@/main'
import { useSelector } from '@xstate/vue';

const isSettingUp = useSelector(applicationState, (s) => s.hasTag('setup'));
const isOnboarding = useSelector(applicationState, (s) => s.hasTag('onboarding'));
const isTouring = useSelector(applicationState, (s) => s.hasTag('guided-tour'));

// Get tour context from application state
const tourContext = useSelector(applicationState, (state) => {
  if (!state.hasTag('guided-tour')) return null;
  
  const tourActorRef = state.children?.guidedTour;
  if (!tourActorRef) {
    console.log('[Tour App.vue] No tour actor in children');
    return null;
  }
  
  const tourSnapshot = tourActorRef.getSnapshot();
  console.log('[Tour App.vue] Tour snapshot:', tourSnapshot);
  return (tourSnapshot as any).context;
});

const currentStep = computed(() => {
  if (!tourContext.value) {
    console.log('[Tour App.vue] No tour context');
    return null;
  }
  const step = tourContext.value.steps[tourContext.value.currentStepIndex];
  console.log('[Tour App.vue] Current step:', step);
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

// Toggle for showing API status (can be toggled with a hotkey)
const showApiStatus = ref(false);

// Listen for keyboard shortcut to toggle API status
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && e.key === 'A') {
    showApiStatus.value = !showApiStatus.value;
  }
});
</script>

<template>
  <!-- Loading skeleton for initial state -->
  <Skeleton v-if="isSettingUp" />

  <template v-else>
    <!-- Onboarding modal overlay -->
    <Onboarding v-if="isOnboarding" />
    <!-- Main web app component (always rendered when running) -->
    <WebApp />
    <!-- Guided tour overlay -->
    <TourSpotlight 
      v-if="isTouring"
      :current-step="currentStep"
      :step-number="stepNumber"
      :total-steps="totalSteps"
      :is-first-step="isFirstStep"
      :is-last-step="isLastStep"
      @next="nextStep"
      @previous="previousStep"
      @end="endTour"
      @complete="completeTour"
    />
  </template>
  
  <!-- Floating API status overlay (toggle with Ctrl+Shift+A) -->
  <div v-if="showApiStatus" class="api-status-overlay">
    <button @click="showApiStatus = false" class="close-btn">×</button>
    <ApiStatus />
  </div>
</template>

<style>
/* Import web app styles */
@import './style.css';

/* API status overlay styles */
.api-status-overlay {
  position: fixed;
  top: 20px;
  right: 20px;
  background: white;
  border: 1px solid #ddd;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 9999;
  max-width: 400px;
  padding: 20px;
}

.close-btn {
  position: absolute;
  top: 10px;
  right: 10px;
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #666;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
}

.close-btn:hover {
  background: #f0f0f0;
}
</style>
