import type { ArtifactDefinition } from '@abuddy/sdk/artifacts';
import { standardArtifacts } from './register';

import TextArtifact from './viewers/text-artifact.vue';
import CodeArtifact from './viewers/code-artifact.vue';
import ReviewArtifact from './viewers/review-artifact.vue';
import ImageArtifact from './viewers/image-artifact.vue';
import SlackArtifact from './viewers/slack-artifact.vue';
import TodoArtifact from './viewers/todo-artifact.vue';
import ProjectArtifact from './viewers/project-artifact.vue';
import JsonArtifact from './viewers/json-artifact.vue';
import ClaudeSessionArtifact from './viewers/claude-session-artifact.vue';
import CodexSessionArtifact from './viewers/codex-session-artifact.vue';
import DiffArtifact from './viewers/diff-artifact.vue';
import MarkdownArtifact from './viewers/markdown-artifact.vue';
import PlanArtifact from './viewers/plan-artifact.vue';
import NoteArtifact from './viewers/note-artifact.vue';

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

export const artifactDefinitions: ArtifactDefinition[] = standardArtifacts.map(def => ({
  ...def,
  fe: def.fe
    ? { ...def.fe, component: componentMap[def.type], loadComponent: undefined }
    : undefined,
}));
