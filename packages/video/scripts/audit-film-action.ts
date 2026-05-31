import {readFileSync} from 'node:fs';
import {cursorOpacityForFrame} from '../src/film/overlays/Cursor';
import {cursorTimeline, percentTarget} from '../src/film/interaction/cursorTargets';
import {boardShotState, boardViewForFrame} from '../src/film/state/board';
import {chatShotViewForFrame, chatViewForFrame, toolActivityViewForFrame} from '../src/film/state/chat';
import {codeReviewViewForFrame, codeShotState} from '../src/film/state/code';
import {finalShotState, finalViewForFrame} from '../src/film/state/final';
import {launchFilmStory} from '../src/film/state/launchStory';
import {montageShotViewForFrame} from '../src/film/state/montage';
import {notesHomeNewNoteButtonTarget} from '../src/film/shots/notesGeometry';
import {notesEditorViewForFrame} from '../src/film/state/notes';
import {workflowStateForFrame} from '../src/film/state/workflow';

type Check = {
  area: ProductArea | 'final';
  message: string;
  pass: boolean;
};

type ProductArea = 'board' | 'chat' | 'code' | 'notes' | 'workflow';

function changed<T>(before: T, after: T) {
  return JSON.stringify(before) !== JSON.stringify(after);
}

function chatTasklistReferenceSelectionPass() {
  const selectingView = chatShotViewForFrame(120).composer.referenceAutocomplete;
  const insertedNode = chatShotViewForFrame(160).composer.content?.[1];
  return selectingView?.level === 'items'
    && selectingView.selectedIndex === 1
    && selectingView.suggestions[1]?.label === 'Tasklist'
    && insertedNode?.type === 'reference'
    && insertedNode.label === 'Tasklist'
    && chatViewForFrame(160).prompt === chatViewForFrame(168).prompt;
}

function chatApprovedSummaryDelayPass() {
  const beforeDelay = chatShotViewForFrame(428).conversation.additionalAssistantMessages ?? [];
  const afterDelay = chatShotViewForFrame(436).conversation.additionalAssistantMessages ?? [];
  return !beforeDelay.some(message => message.markdown.includes('Approved checkout implementation plan'))
    && afterDelay.some(message => message.markdown.includes('Approved checkout implementation plan'));
}

function persistentCursorTimelinePass() {
  const targets = {
    approve: percentTarget(10, 20, 4, 4),
    recent: percentTarget(70, 20, 4, 4),
  };
  const held = cursorTimeline(targets, [
    {start: 10, end: 20, from: 'approve', to: 'approve'},
    {start: 40, end: 50, from: 'approve', to: 'recent'},
  ], 30, 'percent');

  return held?.fade === false
    && held.click === false
    && held.from[0] === held.to[0]
    && held.from[1] === held.to[1];
}

function notesNewNoteCursorTargetPass() {
  const width = 1920;
  const target = notesHomeNewNoteButtonTarget({
    windowStyle: {
      left: 32,
      top: 32,
      width: width - 64,
    },
  }, width);
  const clickPoint = {
    x: target.left + target.width * 0.52,
    y: target.top + target.height * 0.5,
  };
  return target.width >= 100
    && target.height >= 32
    && clickPoint.x > target.left
    && clickPoint.x < target.left + target.width
    && clickPoint.y > target.top
    && clickPoint.y < target.top + target.height
    && target.left < width * 0.74;
}

function boardStoryboardContinuityPass() {
  const tabs = boardShotState.dashboard.tabs;
  const stripeTab = tabs.find(tab => tab.id === launchFilmStory.threads.stripePaymentIntegration.id);
  const deployTab = tabs.find(tab => tab.id === launchFilmStory.threads.deployChecklist.id);
  const createForm = boardShotState.createForm;
  const backlog = boardShotState.board.columns.find(column => column.title === 'Backlog');
  const inProgress = boardShotState.board.columns.find(column => column.title === 'In Progress');

  return boardShotState.dashboard.activeTabId === launchFilmStory.threads.stripePaymentIntegration.id
    && stripeTab?.pinned === true
    && deployTab?.pinned === true
    && createForm.title === launchFilmStory.threads.addDiscountCodeSupport.title
    && createForm.linkedThreadQuery === launchFilmStory.threads.checkoutImplementation.title
    && createForm.parentThread?.shortCode === launchFilmStory.threads.checkoutImplementation.shortCode
    && backlog?.cards.some(card => card.title === launchFilmStory.threads.addDiscountCodeSupport.title) === true
    && inProgress?.cards.some(card => card.title === 'Wire receipt email templates') === true;
}

function notesStoryboardContinuityPass() {
  const overview = notesEditorViewForFrame(100);
  const receiptTodo = notesEditorViewForFrame(150);

  return overview.breadcrumbs.join(' > ') === 'Notes > Supafan > Tasklist'
    && overview.editor.beforeLines.some(line => line.text === launchFilmStory.threads.addDiscountCodeSupport.title)
    && receiptTodo.breadcrumbs.join(' > ') === 'Notes > Supafan > Tasklist > receipt emails'
    && receiptTodo.taskList.items.some(item => item.id === 'receipt-emails' && item.completed === true)
    && receiptTodo.editor.beforeLines.some(line => line.text === 'Configure Resend transport');
}

function codeStoryboardContinuityPass() {
  const pr = codeShotState.review.pullRequest.createdPr;
  return codeShotState.review.branch === launchFilmStory.branch
    && codeShotState.review.baseDirectory === launchFilmStory.projectPath
    && codeShotState.review.worktrees.some(worktree => worktree.branch === launchFilmStory.branch && worktree.path === launchFilmStory.projectPath && worktree.current)
    && codeShotState.generatedCommitMessage === 'feat(checkout): wire Stripe flow, receipts, and discounts'
    && pr?.number === 42
    && pr.baseBranch === launchFilmStory.baseBranch
    && pr.headBranch === launchFilmStory.branch
    && pr.url.includes(launchFilmStory.repo)
    && codeShotState.review.pullRequest.changedFiles.some(file => file.path === 'packages/api/src/services/discount-service.ts');
}

function workflowMontageContinuityPass() {
  const workflow = workflowStateForFrame(360);
  const montageConversation = montageShotViewForFrame(60);
  const montageLogs = montageShotViewForFrame(120);
  const montageDatabase = montageShotViewForFrame(220);

  return workflow.nodes.some(node => node.id === 'switch' && node.label === launchFilmStory.flow.switchLabel)
    && workflow.nodes.some(node => node.id === 'run-migrations' && node.label === launchFilmStory.flow.actionLabels.migrations)
    && workflow.nodes.some(node => node.id === 'notify-releases' && node.label === launchFilmStory.flow.actionLabels.notify)
    && montageConversation.surface === 'conversation'
    && montageConversation.conversation.userMessage === launchFilmStory.command
    && montageConversation.conversation.assistantMarkdown.includes('notified the #releases channel')
    && montageLogs.surface === 'logs'
    && montageLogs.logs.logs.some(log => JSON.stringify(log).includes(launchFilmStory.command))
    && montageDatabase.surface === 'database'
    && JSON.stringify(montageDatabase.database).includes('deploy-checkout');
}

const flowCanvasCss = readFileSync(new URL('../src/agentbuddy-ui/flows/FlowCanvas.module.css', import.meta.url), 'utf8');
const flowEdgeSource = readFileSync(new URL('../src/agentbuddy-ui/flows/FlowEdge.tsx', import.meta.url), 'utf8');
const workflowSource = readFileSync(new URL('../src/film/state/workflow.ts', import.meta.url), 'utf8');
const workflowShotSource = readFileSync(new URL('../src/film/shots/WorkflowShot.tsx', import.meta.url), 'utf8');

const checks: Check[] = [
  {
    area: 'notes',
    message: 'notes shot types new note title',
    pass: notesEditorViewForFrame(0).editor.title.text !== notesEditorViewForFrame(30).editor.title.text,
  },
  {
    area: 'notes',
    message: 'notes shot types checkout note lines',
    pass: notesEditorViewForFrame(12).editor.beforeLines[0].text !== notesEditorViewForFrame(40).editor.beforeLines[0].text
      && notesEditorViewForFrame(30).editor.beforeLines[1].text !== notesEditorViewForFrame(58).editor.beforeLines[1].text,
  },
  {
    area: 'notes',
    message: 'notes shot transitions from new note to tasklist overview',
    pass: notesEditorViewForFrame(70).breadcrumbs.join('/') !== notesEditorViewForFrame(100).breadcrumbs.join('/'),
  },
  {
    area: 'notes',
    message: 'notes new note cursor target lands inside button geometry',
    pass: notesNewNoteCursorTargetPass(),
  },
  {
    area: 'chat',
    message: 'chat shot types user prompt',
    pass: chatViewForFrame(0).prompt !== chatViewForFrame(92).prompt,
  },
  {
    area: 'chat',
    message: 'chat reference autocomplete pauses on Tasklist before continuing',
    pass: chatTasklistReferenceSelectionPass(),
  },
  {
    area: 'chat',
    message: 'chat approved summary appears after a short delay',
    pass: chatApprovedSummaryDelayPass(),
  },
  {
    area: 'chat',
    message: 'chat shot reveals assistant response',
    pass: chatViewForFrame(306).response !== chatViewForFrame(346).response,
  },
  {
    area: 'chat',
    message: 'chat tool activity reveals rows sequentially',
    pass: toolActivityViewForFrame(234).rowOpacities[0] !== toolActivityViewForFrame(250).rowOpacities[0]
      && toolActivityViewForFrame(276).rowOpacities[3] !== toolActivityViewForFrame(292).rowOpacities[3],
  },
  {
    area: 'chat',
    message: 'chat tool activity transitions from streaming to done',
    pass: toolActivityViewForFrame(290).state.state === 'streaming'
      && toolActivityViewForFrame(291).state.state === 'done',
  },
  {
    area: 'board',
    message: 'board dashboard and create form match storyboard continuity',
    pass: boardStoryboardContinuityPass(),
  },
  {
    area: 'board',
    message: 'board shot moves card horizontally',
    pass: boardViewForFrame(282).movingCardStyle.left !== boardViewForFrame(304).movingCardStyle.left,
  },
  {
    area: 'board',
    message: 'board shot moves card vertically',
    pass: boardViewForFrame(282).movingCardStyle.top !== boardViewForFrame(304).movingCardStyle.top,
  },
  {
    area: 'board',
    message: 'board shot rotates moving card',
    pass: boardViewForFrame(282).movingCardStyle.transform !== boardViewForFrame(304).movingCardStyle.transform,
  },
  {
    area: 'code',
    message: 'code branch, PR, files, and repo match storyboard continuity',
    pass: codeStoryboardContinuityPass(),
  },
  {
    area: 'code',
    message: 'code shot reveals diff changes line by line',
    pass: changed(codeReviewViewForFrame(20).diffLineOpacities, codeReviewViewForFrame(120).diffLineOpacities),
  },
  {
    area: 'code',
    message: 'code shot generates commit message',
    pass: codeReviewViewForFrame(142).commitMessage === ''
      && codeReviewViewForFrame(185).commitMessage === codeShotState.generatedCommitMessage,
  },
  {
    area: 'code',
    message: 'code shot switches from commit panel to PR panel',
    pass: codeReviewViewForFrame(96).activePanel === 'commit'
      && codeReviewViewForFrame(317).activePanel === 'pr',
  },
  {
    area: 'code',
    message: 'code shot publishes branch before PR creation',
    pass: codeReviewViewForFrame(318).prPublishProgress === 0
      && codeReviewViewForFrame(350).prPublishProgress === 1,
  },
  {
    area: 'code',
    message: 'code shot progresses through PR files, create, and details modes',
    pass: codeReviewViewForFrame(350).prMode === 'files'
      && codeReviewViewForFrame(380).prMode === 'create'
      && codeReviewViewForFrame(381).prMode === 'details'
      && Boolean(codeReviewViewForFrame(381).pullRequest.createdPr),
  },
  {
    area: 'workflow',
    message: 'workflow and montage command continuity matches storyboard',
    pass: workflowMontageContinuityPass(),
  },
  {
    area: 'notes',
    message: 'notes tasklist continuity matches board-created discount thread and receipt todo',
    pass: notesStoryboardContinuityPass(),
  },
  {
    area: 'workflow',
    message: 'workflow shot reveals blueprint nodes and edges',
    pass: workflowStateForFrame(0).nodes.length !== workflowStateForFrame(260).nodes.length
      && workflowStateForFrame(0).edges.length !== workflowStateForFrame(260).edges.length,
  },
  {
    area: 'workflow',
    message: 'workflow shot stays blueprint-only without runtime status or animated node selection',
    pass: workflowStateForFrame(130).selectedNodeId == null
      && workflowStateForFrame(130).editingNodeId == null
      && !JSON.stringify(workflowStateForFrame(260)).includes('"status"'),
  },
  {
    area: 'workflow',
    message: 'flow execution edges use renderer-style CSS dash animation',
    pass: flowCanvasCss.includes('stroke-dasharray: 5 5')
      && flowCanvasCss.includes('@keyframes FlowCanvas_dashFlow')
      && flowCanvasCss.includes('stroke-dashoffset: -10')
      && !flowEdgeSource.includes('strokeDashoffset')
      && !workflowSource.includes('edgeDashOffset'),
  },
  {
    area: 'workflow',
    message: 'workflow intro uses real FlowCanvas geometry without duplicate straight-edge overlay',
    pass: workflowShotSource.includes('<FlowCanvas backgroundOpacity={backdropReveal} state={view.flow} />')
      && !workflowShotSource.includes('isolatedEdge')
      && !workflowShotSource.includes('appRevealClip')
      && !workflowShotSource.includes('clipPath'),
  },
  {
    area: 'workflow',
    message: 'workflow palette overlays without moving canvas viewport',
    pass: workflowStateForFrame(150).viewport == null
      && workflowStateForFrame(260).viewport == null
      && workflowStateForFrame(156).chrome?.paletteStyle?.opacity === 0
      && Number(workflowStateForFrame(200).chrome?.paletteStyle?.opacity) > 0
      && !String(workflowStateForFrame(200).chrome?.paletteStyle?.width ?? '').includes('px'),
  },
  {
    area: 'chat',
    message: 'cursor fades in and out around path boundaries',
    pass: cursorOpacityForFrame(18, 18, 38) === 0
      && cursorOpacityForFrame(28, 18, 38) > 0.95
      && cursorOpacityForFrame(38, 18, 38) === 0,
  },
  {
    area: 'chat',
    message: 'cursor timeline persists location between actions',
    pass: persistentCursorTimelinePass(),
  },
  {
    area: 'final',
    message: 'final lockup uses canonical revolution copy',
    pass: finalShotState.title === 'AgentBuddy is a revolution'
      && finalShotState.subtitle === 'to put the full power of AI into the hands of the people',
  },
  {
    area: 'final',
    message: 'final shot animates title',
    pass: finalViewForFrame(0).titleStyle.opacity !== finalViewForFrame(80).titleStyle.opacity,
  },
  {
    area: 'final',
    message: 'final shot animates subtitle',
    pass: finalViewForFrame(0).subtitleStyle.opacity !== finalViewForFrame(100).subtitleStyle.opacity,
  },
];

const failed = checks.filter(check => !check.pass);
const minimumMoments = 10;
const minimumProductMoments = 10;
const requiredProductAreas = new Set<ProductArea>(['board', 'chat', 'code', 'notes', 'workflow']);
const productChecks = checks.filter(check => check.area !== 'final');
const coveredProductAreas = new Set(productChecks.map(check => check.area));
const missingProductAreas = [...requiredProductAreas].filter(area => !coveredProductAreas.has(area));

if (failed.length > 0) {
  throw new Error(`Film action audit failed:\n${failed.map(check => `- ${check.message}`).join('\n')}`);
}

if (checks.length < minimumMoments) {
  throw new Error(`Film action audit must prove at least ${minimumMoments} frame-driven moments; only ${checks.length} checks exist.`);
}

if (productChecks.length < minimumProductMoments) {
  throw new Error(`Film action audit must prove at least ${minimumProductMoments} product-surface moments before the final lockup; only ${productChecks.length} checks exist.`);
}

if (missingProductAreas.length > 0) {
  throw new Error(`Film action audit must cover every product surface area; missing ${missingProductAreas.join(', ')}.`);
}

console.log(`Film action audit passed: ${checks.length} frame-driven shot checks across ${coveredProductAreas.size} product areas.`);
