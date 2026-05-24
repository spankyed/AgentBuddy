import {boardViewForFrame} from '../src/film/state/board';
import {chatViewForFrame} from '../src/film/state/chat';
import {codeReviewViewForFrame} from '../src/film/state/code';
import {finalViewForFrame} from '../src/film/state/final';
import {notesViewForFrame} from '../src/film/state/notes';
import {workflowStateForFrame} from '../src/film/state/workflow';

type Check = {
  message: string;
  pass: boolean;
};

const checks: Check[] = [
  {
    message: 'notes shot reveals editor text over time',
    pass: notesViewForFrame(0).lines.join('') !== notesViewForFrame(220).lines.join(''),
  },
  {
    message: 'chat shot reveals prompt and assistant response over time',
    pass: chatViewForFrame(0).prompt !== chatViewForFrame(120).prompt
      && chatViewForFrame(120).response !== chatViewForFrame(280).response,
  },
  {
    message: 'board shot moves a kanban card',
    pass: boardViewForFrame(0).movingCardStyle.left !== boardViewForFrame(170).movingCardStyle.left
      && boardViewForFrame(0).movingCardStyle.top !== boardViewForFrame(170).movingCardStyle.top,
  },
  {
    message: 'code shot progresses from commit review to PR details',
    pass: codeReviewViewForFrame(0).activePanel === 'commit'
      && codeReviewViewForFrame(190).prMode === 'create'
      && codeReviewViewForFrame(230).prMode === 'details'
      && codeReviewViewForFrame(230).prCreated,
  },
  {
    message: 'workflow shot uses blueprint camera/selection motion without runtime status',
    pass: workflowStateForFrame(0).viewport?.x !== workflowStateForFrame(260).viewport?.x
      && workflowStateForFrame(130).selectedNodeId !== workflowStateForFrame(0).selectedNodeId
      && !JSON.stringify(workflowStateForFrame(260)).includes('"status"'),
  },
  {
    message: 'final shot animates title and tagline',
    pass: finalViewForFrame(0).titleStyle.opacity !== finalViewForFrame(80).titleStyle.opacity
      && finalViewForFrame(0).taglineStyle.opacity !== finalViewForFrame(100).taglineStyle.opacity,
  },
];

const failed = checks.filter(check => !check.pass);

if (failed.length > 0) {
  throw new Error(`Film action audit failed:\n${failed.map(check => `- ${check.message}`).join('\n')}`);
}

console.log(`Film action audit passed: ${checks.length} frame-driven shot checks.`);
