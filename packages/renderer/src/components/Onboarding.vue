<template>
  <div class="onboarding-container">
    <div class="onboarding-content">
      <div class="onboarding-header">
        <h1 class="title">Welcome to AgentBuddy</h1>
        <p class="subtitle">Your AI-powered assistant</p>
      </div>

      <div class="onboarding-steps">
        <div class="step" :class="{ completed: step >= 1 }">
          <div class="step-number">1</div>
          <div class="step-content">
            <h3>Getting Started</h3>
            <p>AgentBuddy helps you manage your work with AI assistance.</p>
          </div>
        </div>

        <div class="step" :class="{ completed: step >= 2 }">
          <div class="step-number">2</div>
          <div class="step-content">
            <h3>Explore Plugins</h3>
            <p>Checkout the different ways to interact with and customize your assistant.</p>
          </div>
        </div>

        <div class="step" :class="{ completed: step >= 3 }">
          <div class="step-number">3</div>
          <div class="step-content">
            <h3>Start Building</h3>
            <p>Plan, code, debug, and deploy your projects with your assistant.</p>
          </div>
        </div>
      </div>

      <div class="onboarding-actions">
        <button 
          v-if="step < 3"
          @click="nextStep"
          class="btn btn-secondary"
        >
          Next
        </button>
        <div v-if="step === 3" class="final-actions">
          <button 
            @click="startGuidedTour"
            class="btn btn-tour"
          >
            Take Guided Tour
          </button>
          <button 
            @click="completeOnboarding"
            class="btn btn-primary"
          >
            Get Started
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { applicationState } from '@/main';

const step = ref(1);
const autoplayTimer = ref<NodeJS.Timeout | null>(null);
const autoplayActive = ref(true);

const setAutoplay = () => {
  clearTimeout(autoplayTimer.value!);
  if (autoplayActive.value && step.value < 3) {
    autoplayTimer.value = setTimeout(() => step.value++, 1500);
  }
};

const nextStep = () => {
  if (step.value < 3) {
    step.value++;
    setAutoplay();
  }
};

const previousStep = () => {
  if (step.value > 1) {
    step.value--;
    autoplayActive.value = false;
    clearTimeout(autoplayTimer.value!);
  }
};

const completeOnboarding = () => {
  applicationState.send({ type: 'COMPLETE_ONBOARDING' });
};

const startGuidedTour = () => {
  applicationState.send({ type: 'START_GUIDED_TOUR' });
};

// Handle keyboard navigation
const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'ArrowLeft' && step.value > 1) {
    previousStep();
  } else if (event.key === 'ArrowRight' && step.value < 3) {
    nextStep();
  } else if (event.key === 'Enter') {
    // Handle Enter key based on current step
    if (step.value < 3) {
      nextStep();
    } else {
      // On last step, Enter triggers "Get Started" (not tour)
      completeOnboarding();
    }
  }
};

// Watch for step changes to trigger autoplay
watch(step, setAutoplay);

// Setup and cleanup
onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
  setAutoplay();
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
  clearTimeout(autoplayTimer.value!);
});
</script>

<style scoped>
.onboarding-container {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.7);
  z-index: 9999;
  padding: 2rem;
}

.onboarding-content {
  background: #262626;
  border-radius: 16px;
  padding: 3rem;
  max-width: 600px;
  width: 100%;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

.onboarding-header {
  text-align: center;
  margin-bottom: 3rem;
}

.title {
  font-size: 2.5rem;
  font-weight: 700;
  color: #fff;
  margin-bottom: 0.5rem;
}

.subtitle {
  font-size: 1.1rem;
  color: #999;
}

.onboarding-steps {
  margin-bottom: 3rem;
}

.step {
  display: flex;
  align-items: flex-start;
  margin-bottom: 2rem;
  opacity: 0.5;
  transition: opacity 0.15s ease;
}

.step.completed {
  opacity: 1;
}

.step-number {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #404040;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  margin-right: 1.5rem;
  flex-shrink: 0;
  transition: background-color 0.15s ease;
}

.step.completed .step-number {
  background: #4a9eff;
}

.step-content h3 {
  color: #fff;
  margin-bottom: 0.5rem;
  font-size: 1.2rem;
}

.step-content p {
  color: #999;
  line-height: 1.5;
}

.onboarding-actions {
  display: flex;
  justify-content: center;
  gap: 1rem;
}

.final-actions {
  display: flex;
  gap: 1rem;
}

.btn {
  padding: 0.75rem 2rem;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: background-color 0.15s ease, transform 0.15s ease;
  will-change: transform;
}

.btn-primary {
  background: #4a9eff;
  color: white;
}

.btn-primary:hover {
  background: #3a8eef;
  transform: translateY(-2px);
}

.btn-tour {
  background: #10b981;
  color: white;
}

.btn-tour:hover {
  background: #059669;
  transform: translateY(-2px);
}

.btn-secondary {
  background: #404040;
  color: white;
}

.btn-secondary:hover {
  background: #505050;
  transform: translateY(-2px);
}
</style>