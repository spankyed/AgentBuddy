<template>
  <div class="film-root" :class="variantClass">
    <div class="film-frame">
      <div class="film-window">
        <div class="traffic">
          <span />
          <span />
          <span />
        </div>
        <div class="app-layout">
          <aside class="film-toolbar">
            <button
              v-for="item in navItems"
              :key="item.id"
              class="nav-button"
              :class="{active: item.id === activeNav}"
              :title="item.label"
            >
              <component :is="item.icon" :size="22" />
            </button>
          </aside>

          <main class="main-area">
            <CanvasArea
              :label="headerLabel"
              :breadcrumbs="breadcrumbs"
              :menu-items="[]"
              class="canvas-region"
            >
              <section class="shot-surface">
                <NotesShot v-if="shot.id === 'notes'" :local="local" />
                <ChatShot v-else-if="shot.id === 'chat'" :local="local" />
                <BoardShot v-else-if="shot.id === 'board'" :local="local" />
                <CodeShot v-else-if="shot.id === 'code'" :local="local" />
                <WorkflowShot v-else-if="shot.id === 'workflow'" :local="local" />
                <MontageShot v-else-if="shot.id === 'montage'" :local="local" />
                <FinalShot v-else :local="local" />
              </section>
            </CanvasArea>

            <ChatArea class="chat-region">
              <div class="composer">
                <div class="composer-placeholder">Message Agent</div>
                <div class="composer-actions">
                  <span>Codex</span>
                  <button>Plan</button>
                  <button class="send">Send ↵</button>
                </div>
              </div>
              <div class="thread-tabs">
                <span>Recent Threads</span>
                <span>AgentBuddy launch film</span>
                <span>+ New thread</span>
              </div>
            </ChatArea>
          </main>

          <aside v-if="showRightRail" class="right-rail">
            <div class="rail-title">Notes</div>
            <div v-for="item in noteRail" :key="item" class="rail-item" :class="{active: item.includes('Tasklist')}">
              {{ item }}
            </div>
          </aside>
        </div>
      </div>
    </div>

    <div v-if="shot.title" class="film-caption" :style="captionStyle">{{ shot.title }}</div>
    <div class="progress"><div :style="{width: `${progress * 100}%`}" /></div>
  </div>
</template>

<script setup lang="ts">
import {computed} from 'vue';
import {
  BotMessageSquare,
  ClipboardList,
  Code2,
  Database,
  FileText,
  GitBranch,
  NotebookText,
  Play,
  Settings,
  Sparkles,
} from 'lucide-vue-next';
import CanvasArea from '@/core/components/layout/canvas-area.vue';
import ChatArea from '@/core/components/layout/chat-area.vue';
import {ease, getShot, mix, totalFrames, type FilmVariant} from './timeline';

const params = new URLSearchParams(window.location.search);
const frame = computed(() => Number(params.get('frame') ?? 0));
const variant = computed<FilmVariant>(() => params.get('variant') === 'square' ? 'square' : 'landscape');
const current = computed(() => getShot(frame.value));
const shot = computed(() => current.value.shot);
const local = computed(() => current.value.local);
const progress = computed(() => frame.value / Math.max(1, totalFrames - 1));
const variantClass = computed(() => `is-${variant.value}`);
const showRightRail = computed(() => shot.value.id === 'notes');

const navItems = [
  {id: 'threads', label: 'Threads', icon: BotMessageSquare},
  {id: 'notes', label: 'Notes', icon: NotebookText},
  {id: 'code', label: 'Code', icon: Code2},
  {id: 'flows', label: 'Workflows', icon: GitBranch},
  {id: 'actions', label: 'Actions', icon: Play},
  {id: 'brain', label: 'Brain', icon: Sparkles},
  {id: 'database', label: 'Database', icon: Database},
  {id: 'settings', label: 'Settings', icon: Settings},
];

const noteRail = ['☆ FAVORITES', '🔥 current', '💻 cli', '🎬 Videos', '🌐 Clientlabs', '🚀 Agentbuddy', '📝 Tasklist', '⭐ Brand & Content'];

const activeNav = computed(() => {
  if (shot.value.id === 'notes') return 'notes';
  if (shot.value.id === 'code') return 'code';
  if (shot.value.id === 'workflow') return 'flows';
  if (shot.value.id === 'montage') return 'brain';
  return 'threads';
});

const headerLabel = computed(() => {
  if (shot.value.id === 'notes') return 'Notes Canvas';
  if (shot.value.id === 'code') return 'Code Canvas';
  if (shot.value.id === 'workflow') return 'Flows Canvas';
  return 'Threads Canvas';
});

const breadcrumbs = computed(() => {
  if (shot.value.id === 'notes') return [{label: 'Notes'}, {label: 'AgentBuddy'}, {label: 'Tasklist'}, {label: 'Current'}];
  if (shot.value.id === 'code') return [{label: 'Code'}, {label: 'Launch Film'}, {label: 'Branch'}];
  if (shot.value.id === 'workflow') return [{label: 'Flows'}, {label: 'Release Automation'}];
  return [{label: 'Threads'}, {label: shot.value.id === 'board' ? 'Board' : 'Launch Thread'}];
});

const captionStyle = computed(() => {
  const opacity = Math.min(ease(local.value, 10, 34), 1 - ease(local.value, shot.value.duration - 48, shot.value.duration - 12));
  return {
    opacity,
    transform: `translateY(${mix(20, 0, ease(local.value, 0, 34))}px)`,
  };
});
</script>

<script lang="ts">
import {defineComponent, h} from 'vue';
import {ease as timelineEase, mix as timelineMix} from './timeline';

function typeText(text: string, local: number, start: number, end: number) {
  return text.slice(0, Math.floor(timelineMix(0, text.length, timelineEase(local, start, end))));
}

const NotesShot = defineComponent({
  props: {local: {type: Number, required: true}},
  setup(props) {
    return () => h('div', {class: 'notes-shot'}, [
      h('aside', {class: 'notes-list'}, ['📝 Tasklist', '🚧 default setup', '🔥 current', '✓ remotion', '✓ phone app', '🪲 bugs', '🗺️ V1 Roadmap'].map((item, index) =>
        h('div', {class: ['note-row', index === 2 ? 'active' : '']}, item),
      )),
      h('article', {class: 'note-doc'}, [
        h('div', {class: 'note-path'}, 'NOTES › 🚀 AGENTBUDDY › 📝 TASKLIST › 🔥 CURRENT'),
        h('ul', [
          h('li', 'provocative posts'),
          h('li', '3 clips a week for clientlabs yt'),
          h('li', typeText('demo different features with cinematic product scenes', props.local, 35, 120)),
        ]),
        h('hr'),
        h('ul', {class: 'fresh-lines'}, [
          h('li', typeText('conversation becomes tickets, notes, code, and workflows', props.local, 132, 205)),
          h('li', typeText('same surface, same memory, no context handoff', props.local, 170, 245)),
        ]),
      ]),
    ]);
  },
});

const ChatShot = defineComponent({
  props: {local: {type: Number, required: true}},
  setup(props) {
    const steps = ['Read launch memory', 'Create execution tickets', 'Draft code branch plan', 'Schedule release workflow'];
    return () => h('div', {class: 'chat-shot'}, [
      h('div', {class: 'thread-card'}, [h('strong', 'Launch AgentBuddy'), h('span', 'ACTIVE')]),
      h('div', {class: 'user-bubble'}, typeText('Turn this launch brief into tickets, notes, and a shippable PR plan.', props.local, 26, 88)),
      h('div', {class: 'agent-work'}, [
        h('div', {class: 'muted'}, 'Agent is working'),
        ...steps.map((step, index) => h('div', {class: 'work-line', style: {opacity: timelineEase(props.local, 100 + index * 22, 118 + index * 22)}}, [
          h('span'),
          h('p', step),
        ])),
      ]),
      h('div', {class: 'artifact-card', style: {opacity: timelineEase(props.local, 172, 210)}}, [
        h('header', [h('span', 'Launch Operating Plan'), h('small', 'artifact')]),
        ...['Capture launch context', 'Create execution tickets', 'Generate branch and PR plan', 'Automate release checks'].map((row, index) =>
          h('div', {class: 'artifact-row', style: {opacity: timelineEase(props.local, 190 + index * 18, 206 + index * 18)}}, [h('span', row), h('small', index < 2 ? 'done' : index === 2 ? 'active' : 'queued')]),
        ),
      ]),
      h('div', {class: 'film-cursor', style: {left: `${timelineMix(48, 78, timelineEase(props.local, 80, 190))}%`, top: `${timelineMix(30, 36, timelineEase(props.local, 80, 190))}%`}}),
    ]);
  },
});

const BoardShot = defineComponent({
  props: {local: {type: Number, required: true}},
  setup(props) {
    const p = () => timelineEase(props.local, 70, 170);
    return () => h('div', {class: 'board-shot'}, [
      ...['Backlog', 'In Progress', 'Done'].map((column, index) =>
        h('section', {class: 'board-col'}, [
          h('header', [h('span', column), h('small', index === 1 ? '2' : index === 0 ? '1' : '0')]),
          index === 0 ? h('div', {class: 'task-card muted'}, 'Ship capture-state renderer') : null,
          index === 1 ? h('div', {class: 'task-card'}, 'Automate release checks') : null,
        ]),
      ),
      h('div', {class: 'task-card active moving', style: {left: `${timelineMix(8, 40, p())}%`, top: `${timelineMix(34, 24, p())}%`, transform: `rotate(${timelineMix(-2, 1, p())}deg)`}}, 'Publish launch film cutdown'),
    ]);
  },
});

const CodeShot = defineComponent({
  props: {local: {type: Number, required: true}},
  setup(props) {
    const lines = [
      ['+', 'export const launchMoments = createTimeline({'],
      ['+', '  chat: streamConversation(becomesWork),'],
      ['+', '  code: generateCommitAndPullRequest(),'],
      ['-', '  screenshots: panAcrossStaticFrames(),'],
      ['+', '  workflow: activateReleaseAutomation(),'],
      ['+', '});'],
    ];
    return () => h('div', {class: 'code-shot'}, [
      h('aside', {class: 'file-list'}, ['src/demo/timeline.ts', 'src/ui/AppShell.vue', 'src/shots/Workflow.vue'].map((file, index) => h('div', {class: index === 1 ? 'active' : ''}, file))),
      h('section', {class: 'diff-view'}, [
        h('header', [h('span', 'AppShell.vue'), h('small', `${Math.round(timelineMix(0, 6, timelineEase(props.local, 60, 132)))} changes`)]),
        ...lines.map(([kind, line], index) => h('pre', {class: kind === '+' ? 'add' : 'remove', style: {opacity: timelineEase(props.local, 48 + index * 16, 66 + index * 16)}}, `${kind} ${line}`)),
        h('div', {class: 'commit-card', style: {opacity: timelineEase(props.local, 178, 220)}}, [
          h('small', 'GENERATED COMMIT'),
          h('strong', 'feat(video): build Vue-driven launch film'),
        ]),
      ]),
      h('aside', {class: 'ship-list'}, ['branch published', 'checks passed', 'PR created'].map((item, index) => h('div', {style: {opacity: timelineEase(props.local, 216 + index * 22, 236 + index * 22)}}, item))),
    ]);
  },
});

const WorkflowShot = defineComponent({
  props: {local: {type: Number, required: true}},
  setup(props) {
    const nodes = [
      ['Command', 18, 32],
      ['Context', 42, 52],
      ['Actions', 64, 32],
      ['Release', 78, 58],
    ] as const;
    return () => h('div', {class: 'workflow-shot'}, [
      h('svg', {class: 'flow-lines'}, nodes.slice(0, -1).map((node, index) => {
        const next = nodes[index + 1];
        const p = timelineEase(props.local, 62 + index * 30, 92 + index * 30);
        return h('line', {x1: `${node[1]}%`, y1: `${node[2]}%`, x2: `${timelineMix(node[1], next[1], p)}%`, y2: `${timelineMix(node[2], next[2], p)}%`});
      })),
      ...nodes.map((node, index) => h('div', {class: 'flow-node', style: {left: `${node[1]}%`, top: `${node[2]}%`, opacity: timelineEase(props.local, 34 + index * 26, 52 + index * 26)}}, node[0])),
      h('div', {class: 'command-card', style: {opacity: timelineEase(props.local, 190, 232)}}, [h('small', 'COMMAND LISTENER'), h('strong', '/launch-week')]),
    ]);
  },
});

const MontageShot = defineComponent({
  props: {local: {type: Number, required: true}},
  setup(props) {
    const items = ['Memory graph updated', 'Execution stream visible', 'Knowledge query returned', 'Defaults personalized', 'Threads dashboard', 'Workflow completed'];
    return () => {
      const active = Math.min(items.length - 1, Math.floor(props.local / 58));
      return h('div', {class: 'montage-shot'}, items.map((item, index) => h('div', {class: ['montage-card', index === active ? 'active' : '']}, [h('small', `0${index + 1}`), h('strong', item), h('span', {style: {width: index === active ? `${timelineMix(8, 100, timelineEase(props.local % 58, 0, 48))}%` : '14%'}})])));
    };
  },
});

const FinalShot = defineComponent({
  props: {local: {type: Number, required: true}},
  setup() {
    return () => h('div', {class: 'final-shot'}, [h('h1', 'AgentBuddy'), h('p', 'The AI operating system for modern work.')]);
  },
});

export default {
  components: {NotesShot, ChatShot, BoardShot, CodeShot, WorkflowShot, MontageShot, FinalShot},
};
</script>

<style scoped>
.film-root {
  position: fixed;
  inset: 0;
  overflow: hidden;
  background: #06080a;
  color: #f4f4f5;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.film-frame {
  position: absolute;
  inset: 32px;
}
.is-square .film-frame {
  inset: 72px 42px 110px;
}
.film-window {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border: 1px solid rgb(50 50 50);
  border-radius: 8px;
  background: rgb(20 20 20);
  box-shadow: 0 45px 150px rgb(0 0 0 / 56%);
}
.traffic {
  position: absolute;
  left: 14px;
  top: 11px;
  z-index: 5;
  display: flex;
  gap: 8px;
}
.traffic span {
  width: 11px;
  height: 11px;
  border-radius: 999px;
}
.traffic span:nth-child(1) { background: #ff5f57; }
.traffic span:nth-child(2) { background: #ffbd2e; }
.traffic span:nth-child(3) { background: #28c840; }
.app-layout {
  height: 100%;
  display: grid;
  grid-template-columns: 72px 1fr minmax(0, 368px);
}
.is-square .app-layout {
  grid-template-columns: 72px 1fr;
}
.film-toolbar {
  border-right: 1px solid rgb(38 38 38);
  padding-top: 50px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
}
.nav-button {
  width: 40px;
  height: 40px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: rgb(160 160 160);
}
.nav-button.active {
  background: #1e6fd9;
  color: white;
}
.main-area {
  min-width: 0;
  display: grid;
  grid-template-rows: 1fr 168px;
}
.canvas-region {
  min-height: 0;
}
.chat-region {
  border-top: 1px solid rgb(38 38 38);
}
.shot-surface {
  position: relative;
  height: 100%;
  overflow: hidden;
  background: rgb(23 23 23);
}
.composer {
  margin: 22px 26px 10px;
  height: 86px;
  border: 1px solid rgb(64 64 64);
  border-radius: 8px;
  background: rgb(31 31 31);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 18px;
}
.composer-placeholder,
.thread-tabs {
  color: rgb(115 115 115);
}
.composer-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  color: rgb(212 212 212);
}
.composer-actions button {
  border: 0;
  border-radius: 6px;
  background: rgb(45 45 45);
  color: rgb(245 245 245);
  padding: 7px 12px;
}
.composer-actions .send {
  background: rgb(82 102 126);
}
.thread-tabs {
  display: flex;
  justify-content: space-around;
  font-size: 13px;
}
.right-rail {
  border-left: 1px solid rgb(38 38 38);
  padding: 48px 14px;
  background: rgb(24 24 24);
}
.is-square .right-rail {
  display: none;
}
.rail-title {
  font-size: 15px;
  margin-bottom: 22px;
}
.rail-item {
  padding: 9px 12px;
  border-radius: 6px;
  color: rgb(145 145 145);
}
.rail-item.active {
  background: rgb(64 64 64);
  color: white;
}
.film-caption {
  position: absolute;
  left: 58px;
  bottom: 38px;
  max-width: 1100px;
  font-size: 64px;
  line-height: .95;
  font-weight: 800;
  letter-spacing: -0.01em;
  text-shadow: 0 18px 60px rgb(0 0 0 / 58%);
}
.is-square .film-caption {
  font-size: 56px;
  bottom: 46px;
}
.progress {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 3px;
  background: rgb(255 255 255 / 10%);
}
.progress div {
  height: 100%;
  background: linear-gradient(90deg, #2dd4bf, #3b82f6, #f8fafc);
}
.notes-shot {
  height: 100%;
  display: grid;
  grid-template-columns: 250px 1fr;
}
.notes-list {
  border-right: 1px solid rgb(38 38 38);
  padding: 16px;
}
.note-row {
  padding: 9px 12px;
  border-radius: 7px;
  color: rgb(148 148 148);
}
.note-row.active {
  background: rgb(64 64 64);
  color: white;
}
.note-doc {
  padding: 34px 56px;
  font-size: 17px;
  line-height: 1.65;
}
.note-path {
  color: rgb(145 145 145);
  font-size: 12px;
  text-transform: uppercase;
  margin-bottom: 18px;
}
.note-doc hr {
  border: 0;
  border-top: 1px solid rgb(64 64 64);
  margin: 30px 0;
}
.fresh-lines {
  color: rgb(236 253 245);
}
.chat-shot,
.board-shot,
.workflow-shot,
.montage-shot,
.final-shot {
  position: absolute;
  inset: 0;
}
.thread-card,
.agent-work,
.artifact-card,
.user-bubble,
.task-card,
.commit-card,
.command-card {
  border: 1px solid rgb(64 64 64);
  background: rgb(31 31 31);
  border-radius: 8px;
}
.thread-card {
  position: absolute;
  left: 6%;
  top: 10%;
  width: 210px;
  padding: 14px;
}
.thread-card span {
  display: block;
  margin-top: 7px;
  color: #2dd4bf;
  font-size: 12px;
}
.user-bubble {
  position: absolute;
  right: 9%;
  top: 22%;
  max-width: 520px;
  padding: 13px 15px;
  background: rgb(30 41 59);
}
.agent-work {
  position: absolute;
  left: 10%;
  top: 34%;
  width: 310px;
  padding: 18px;
}
.muted {
  color: rgb(145 145 145);
  margin-bottom: 12px;
}
.work-line {
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 9px 0;
}
.work-line span {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #2dd4bf;
}
.work-line:last-child span {
  background: #f59e0b;
}
.work-line p {
  margin: 0;
}
.artifact-card {
  position: absolute;
  right: 6%;
  top: 16%;
  width: 420px;
  padding: 18px;
}
.artifact-card header,
.artifact-row {
  display: flex;
  justify-content: space-between;
}
.artifact-row {
  padding: 12px 0;
  border-top: 1px solid rgb(64 64 64);
}
.artifact-row small {
  color: #86efac;
}
.film-cursor {
  position: absolute;
  width: 0;
  height: 0;
  border-left: 8px solid white;
  border-bottom: 20px solid transparent;
  filter: drop-shadow(0 8px 14px rgb(0 0 0 / 70%));
}
.board-shot {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 18px;
  padding: 26px;
}
.board-col {
  border: 1px solid rgb(64 64 64);
  border-radius: 8px;
  padding: 14px;
  background: rgb(24 24 24);
}
.board-col header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 14px;
  font-weight: 700;
}
.task-card {
  padding: 14px;
  margin-bottom: 10px;
}
.task-card.muted {
  opacity: .55;
}
.task-card.active {
  border-color: rgb(45 212 191 / 50%);
  background: rgb(20 184 166 / 16%);
}
.task-card.moving {
  position: absolute;
  width: 300px;
  box-shadow: 0 25px 70px rgb(0 0 0 / 50%);
}
.code-shot {
  height: 100%;
  display: grid;
  grid-template-columns: 270px 1fr 285px;
}
.file-list,
.ship-list {
  padding: 18px;
  border-right: 1px solid rgb(38 38 38);
}
.ship-list {
  border-right: 0;
  border-left: 1px solid rgb(38 38 38);
}
.file-list div,
.ship-list div {
  padding: 11px 12px;
  margin-bottom: 8px;
  border-radius: 7px;
  background: rgb(31 31 31);
}
.file-list .active {
  background: rgb(20 83 75);
}
.diff-view {
  padding: 26px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.diff-view header {
  display: flex;
  justify-content: space-between;
  color: rgb(145 145 145);
  margin-bottom: 20px;
}
.diff-view pre {
  margin: 0;
  padding: 7px 10px;
  font-size: 14px;
}
.diff-view .add {
  color: #bbf7d0;
  background: rgb(22 101 52 / 28%);
}
.diff-view .remove {
  color: #fecaca;
  background: rgb(127 29 29 / 32%);
}
.commit-card {
  margin-top: 26px;
  padding: 15px;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
}
.commit-card small {
  display: block;
  color: rgb(145 145 145);
  margin-bottom: 7px;
}
.workflow-shot {
  background-image: radial-gradient(rgb(255 255 255 / 8%) 1px, transparent 1px);
  background-size: 22px 22px;
}
.flow-lines {
  position: absolute;
  inset: 0;
}
.flow-lines line {
  stroke: rgb(45 212 191 / 60%);
  stroke-width: 2;
}
.flow-node {
  position: absolute;
  transform: translate(-50%, -50%);
  width: 128px;
  height: 46px;
  display: grid;
  place-items: center;
  border: 1px solid rgb(45 212 191 / 50%);
  background: rgb(31 31 31);
  box-shadow: 0 0 42px rgb(45 212 191 / 18%);
  font-weight: 700;
}
.command-card {
  position: absolute;
  right: 8%;
  top: 18%;
  width: 280px;
  padding: 18px;
}
.command-card small {
  display: block;
  color: rgb(145 145 145);
  margin-bottom: 8px;
}
.command-card strong {
  font-size: 22px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.montage-shot {
  padding: 26px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}
.montage-card {
  padding: 18px;
  border: 1px solid rgb(64 64 64);
  background: rgb(31 31 31);
  opacity: .45;
}
.montage-card.active {
  opacity: 1;
  border-color: rgb(45 212 191 / 55%);
  background: rgb(20 184 166 / 14%);
}
.montage-card small {
  color: rgb(145 145 145);
}
.montage-card strong {
  display: block;
  margin-top: 18px;
  font-size: 24px;
}
.montage-card span {
  display: block;
  height: 4px;
  margin-top: 28px;
  background: #2dd4bf;
}
.final-shot {
  display: grid;
  place-content: center;
  text-align: center;
  background: radial-gradient(circle at 50% 45%, rgb(45 212 191 / 12%), transparent 35%), rgb(18 18 18);
}
.final-shot h1 {
  margin: 0;
  font-size: 88px;
  line-height: .95;
}
.final-shot p {
  margin-top: 22px;
  color: rgb(190 190 190);
  font-size: 30px;
}
</style>
