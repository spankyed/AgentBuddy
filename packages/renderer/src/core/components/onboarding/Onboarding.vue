<template>
  <div class="onboarding-container">
    <div class="onboarding-content">
      <div class="onboarding-header">
        <h1 class="title">A Letter from the Dev</h1>
      </div>

      <div class="letter-body">
        <p>
          <!-- Placeholder: the user will provide the actual letter content -->
          Welcome to AgentBuddy! I built this app to help developers like you
          work more effectively with AI coding assistants. I hope you enjoy using it
          as much as I enjoyed building it.
        </p>
        <p class="signature">— The Developer</p>
      </div>

      <div class="onboarding-actions">
        <button
          @click="closeDevLetter"
          class="btn btn-primary"
        >
          Get Started
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { applicationState } from '@/main';

const closeDevLetter = () => {
  applicationState.send({ type: 'CLOSE_DEV_LETTER' });
};

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Enter') {
    closeDevLetter();
  }
};

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
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
  margin-bottom: 2rem;
}

.title {
  font-size: 2rem;
  font-weight: 700;
  color: #fff;
}

.letter-body {
  margin-bottom: 2.5rem;
  line-height: 1.7;
  color: #ccc;
  font-size: 1.05rem;
}

.letter-body p {
  margin-bottom: 1rem;
}

.signature {
  color: #999;
  font-style: italic;
  margin-top: 1.5rem;
}

.onboarding-actions {
  display: flex;
  justify-content: center;
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
</style>
