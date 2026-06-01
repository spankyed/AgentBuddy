import {nextTick} from 'vue';
import {disableDemoAnimationVariance, getDemoFixture} from './adapters';
import {DemoMockBackend} from './mock-backend';
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
  const mockBackend = new DemoMockBackend(fixture);

  disableDemoAnimationVariance();

  localStorage.setItem('agentbuddy-last-active-plugin', scene.pluginId ?? 'threads');
  localStorage.setItem('agentbuddy-panel-sizes', JSON.stringify(scene.panelSizes));

  if ((scene.pluginId ?? 'threads') === 'threads') {
    localStorage.setItem('threads-view-preference', scene.threadView ?? 'dashboard');
    localStorage.setItem('threads-open-tabs', JSON.stringify({
      tabs: [{id: fixture.thread.id, label: fixture.thread.topic}],
      activeTabId: fixture.thread.id,
    }));
  }

  mockBackend.connectScene(config);

  await document.fonts?.ready;
  await nextTick();
  await waitForAnimationFrames(2);

  await window.electronAPI?.demoReady();
}
