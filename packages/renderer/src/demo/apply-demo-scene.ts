import {nextTick} from 'vue';
import {applicationState} from '@/main';
import {disableDemoAnimationVariance, getDemoFixture} from './adapters';
import type {DemoConfig} from './types';

function waitForAnimationFrames(count: number): Promise<void> {
  return new Promise(resolve => {
    const step = () => {
      count -= 1;
      if (count <= 0) {
        resolve();
        return;
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

export async function applyDemoScene(config: DemoConfig) {
  const fixture = getDemoFixture(config);
  const scene = fixture.scenes[config.scene];
  const threadsActor = applicationState.system.get('threads');

  disableDemoAnimationVariance();

  localStorage.setItem('agentbuddy-last-active-plugin', 'threads');
  localStorage.setItem('agentbuddy-panel-sizes', JSON.stringify(scene.panelSizes));
  localStorage.setItem('threads-view-preference', 'dashboard');
  localStorage.setItem('threads-open-tabs', JSON.stringify({
    tabs: [{id: fixture.thread.id, label: fixture.thread.topic}],
    activeTabId: fixture.thread.id,
  }));

  applicationState.send({
    type: 'DEMO.HYDRATE',
    pluginId: 'threads',
    targetView: 'dashboard',
    panelSizes: scene.panelSizes,
  });

  threadsActor.send({
    type: 'THREAD_CONNECTED',
    data: {
      threads: fixture.threads,
      availableTags: fixture.settings.tags,
      settings: fixture.settings,
      chatStates: {[fixture.thread.id]: fixture.thread.chatState ?? 'idle'},
    },
  } as any);

  threadsActor.send({
    type: 'THREADS_SETTINGS_UPDATED',
    settings: fixture.settings,
  } as any);

  threadsActor.send({
    type: 'LOAD_CHAT_THREAD',
    data: fixture.thread,
    restore: true,
  } as any);

  threadsActor.send({
    type: 'THREAD_TAB_REQUESTED',
    threadId: fixture.thread.id,
    topic: fixture.thread.topic,
    artifacts: fixture.artifacts,
    pinned: true,
  } as any);

  if (scene.selectedArtifactId) {
    threadsActor.send({type: 'SELECT_ARTIFACT', artifactId: scene.selectedArtifactId} as any);
  }

  await document.fonts?.ready;
  await nextTick();
  await waitForAnimationFrames(2);

  await window.electronAPI?.demoReady();
}
