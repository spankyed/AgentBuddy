import { artifactRegistry } from '@abuddy/sdk/artifacts';
import { standardArtifacts } from './register';

import TextArtifact from '../plugins/threads/fe/canvas/agent/artifacts/types/text-artifact.vue';
import CodeArtifact from '../plugins/threads/fe/canvas/agent/artifacts/types/code-artifact.vue';
import ReviewArtifact from '../plugins/threads/fe/canvas/agent/artifacts/types/review-artifact.vue';
import ImageArtifact from '../plugins/threads/fe/canvas/agent/artifacts/types/image-artifact.vue';
import SlackArtifact from '../plugins/threads/fe/canvas/agent/artifacts/types/slack-artifact.vue';
import TodoArtifact from '../plugins/threads/fe/canvas/agent/artifacts/types/todo-artifact.vue';
import ProjectArtifact from '../plugins/threads/fe/canvas/agent/artifacts/types/project-artifact.vue';
import JsonArtifact from '../plugins/threads/fe/canvas/agent/artifacts/types/json-artifact.vue';
import ClaudeSessionArtifact from '../plugins/threads/fe/canvas/agent/artifacts/types/claude-session-artifact.vue';
import CodexSessionArtifact from '../plugins/threads/fe/canvas/agent/artifacts/types/codex-session-artifact.vue';
import DiffArtifact from '../plugins/threads/fe/canvas/agent/artifacts/types/diff-artifact.vue';
import MarkdownArtifact from '../plugins/threads/fe/canvas/agent/artifacts/types/markdown-artifact.vue';
import PlanArtifact from '../plugins/threads/fe/canvas/agent/artifacts/types/plan-artifact.vue';
import NoteArtifact from '../plugins/threads/fe/canvas/agent/artifacts/types/note-artifact.vue';

const componentMap: Record<string, unknown> = {
  text: TextArtifact,
  code: CodeArtifact,
  review: ReviewArtifact,
  image: ImageArtifact,
  slack: SlackArtifact,
  todo: TodoArtifact,
  project: ProjectArtifact,
  json: JsonArtifact,
  'claude-session': ClaudeSessionArtifact,
  'codex-session': CodexSessionArtifact,
  diff: DiffArtifact,
  markdown: MarkdownArtifact,
  plan: PlanArtifact,
  note: NoteArtifact,
};

for (const def of standardArtifacts) {
  artifactRegistry.register({
    ...def,
    fe: def.fe
      ? { ...def.fe, component: componentMap[def.type], loadComponent: undefined }
      : undefined,
  });
}
