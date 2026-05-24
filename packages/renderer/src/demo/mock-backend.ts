import {applicationState} from '@/main';
import type {DemoConfig, DemoFixture} from './types';

export class DemoMockBackend {
  readonly #fixture: DemoFixture;

  constructor(fixture: DemoFixture) {
    this.#fixture = fixture;
  }

  connectScene(config: DemoConfig) {
    const scene = this.#fixture.scenes[config.scene];
    const pluginId = scene.pluginId ?? 'threads';
    const targetView = scene.targetView ?? (pluginId === 'threads' ? 'dashboard' : '');
    const threadsActor = applicationState.system.get('threads');

    applicationState.send({
      type: 'DEMO.HYDRATE',
      pluginId,
      targetView,
      panelSizes: scene.panelSizes,
    });

    if (pluginId !== 'threads') return;

    threadsActor.send({
      type: 'THREAD_CONNECTED',
      data: {
        threads: this.#fixture.threads,
        availableTags: this.#fixture.settings.tags,
        settings: this.#fixture.settings,
        chatStates: {[this.#fixture.thread.id]: this.#fixture.thread.chatState ?? 'idle'},
      },
    } as any);

    threadsActor.send({
      type: 'THREADS_SETTINGS_UPDATED',
      settings: this.#fixture.settings,
    } as any);

    threadsActor.send({
      type: 'LOAD_CHAT_THREAD',
      data: this.#fixture.thread,
      restore: true,
    } as any);

    threadsActor.send({
      type: 'THREAD_TAB_REQUESTED',
      threadId: this.#fixture.thread.id,
      topic: this.#fixture.thread.topic,
      artifacts: this.#fixture.artifacts,
      pinned: true,
    } as any);

    if (scene.threadView === 'kanban') {
      threadsActor.send({type: 'VIEW_KANBAN'} as any);
    } else if (scene.threadView === 'list') {
      threadsActor.send({type: 'VIEW_LIST'} as any);
    } else {
      threadsActor.send({type: 'VIEW_DASHBOARD'} as any);
    }

    if (scene.selectedArtifactId) {
      threadsActor.send({type: 'SELECT_ARTIFACT', artifactId: scene.selectedArtifactId} as any);
    }
  }
}
