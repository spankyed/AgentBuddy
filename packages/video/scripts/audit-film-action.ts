import {readFileSync} from 'node:fs';
import {cursorOpacityForFrame} from '../src/film/overlays/Cursor';
import {boardViewForFrame} from '../src/film/state/board';
import {chatShotViewForFrame, chatViewForFrame, toolActivityViewForFrame} from '../src/film/state/chat';
import {codeReviewViewForFrame, codeShotState} from '../src/film/state/code';
import {finalViewForFrame} from '../src/film/state/final';
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

const flowCanvasCss = readFileSync(new URL('../src/agentbuddy-ui/flows/FlowCanvas.module.css', import.meta.url), 'utf8');
const flowEdgeSource = readFileSync(new URL('../src/agentbuddy-ui/flows/FlowEdge.tsx', import.meta.url), 'utf8');
const workflowSource = readFileSync(new URL('../src/film/state/workflow.ts', import.meta.url), 'utf8');

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
    area: 'chat',
    message: 'cursor fades in and out around path boundaries',
    pass: cursorOpacityForFrame(18, 18, 38) === 0
      && cursorOpacityForFrame(28, 18, 38) > 0.95
      && cursorOpacityForFrame(38, 18, 38) === 0,
  },
  {
    area: 'final',
    message: 'final shot animates link',
    pass: finalViewForFrame(0).linkStyle.opacity !== finalViewForFrame(80).linkStyle.opacity,
  },
  {
    area: 'final',
    message: 'final shot animates date',
    pass: finalViewForFrame(0).dateStyle.opacity !== finalViewForFrame(100).dateStyle.opacity,
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
