<template>
  <div class="welcome-container">
    <div class="welcome-content">
      <div class="welcome-header">
        <h1 class="title">A Letter from the Dev</h1>
      </div>

      <div class="letter-body">
        <TiptapEditor mode="viewer" variant="chat" :model-value="letterContent" />
      </div>

      <div class="welcome-actions">
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
import TiptapEditor from '@/core/components/tiptap/TiptapEditor.vue';
import { DISCORD_URL } from '@/core/constants';

const letterContent = `Hello Testers,

Welcome to AgentBuddy! First off, thank you for being here early. Your feedback is invaluable as I work to make AgentBuddy the best AI-powered tool for developers.

AgentBuddy isn't a project I started last month—it's an idea I've been iterating on, in different forms, since 2017. In recent years, I've watched a pattern emerge: as AI systems become more powerful, they also become more opaque. Access gets gated. Integrating with them becomes clunky and restrictive. You're expected to adapt to the system instead of helping shape it.

AgentBuddy is my attempt to flip that on its head.

It's built to be **local-first**, transparent, and adaptable—something that works *with* you, not behind a curtain. I believe you should be able to understand what your tools are doing, customize them, and trust them.

That said, this is still early. You'll run into rough edges, missing pieces, and things that don't quite click yet.

That's where you come in.

What feels powerful? What feels frustrating? What would make this actually useful in your daily flow?

Your [feedback](${DISCORD_URL}) directly shapes what I build next.

Thanks for taking a chance on this.

*— The Developer*`;

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
.welcome-container {
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

.welcome-content {
  background: #262626;
  border-radius: 16px;
  padding: 3rem;
  max-width: 800px;
  width: 100%;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

.welcome-header {
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

.welcome-actions {
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
