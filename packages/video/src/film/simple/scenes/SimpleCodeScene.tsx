import {AppWindow} from '../../../agentbuddy-ui/chrome/AppWindow';
import {CodeReview} from '../../../agentbuddy-ui/code/CodeReview';
import {Cursor} from '../../overlays/Cursor';
import {cursorTimeline} from '../../interaction/cursorTargets';
import type {CursorPath} from '../../interaction/cursorTargets';
import {codeShotViewForFrame, expandedTerminalPanelState} from '../../state/code';
import {useAppWindowLayout} from '../../appWindowLayout';
import {codeCursorTargets} from '../../shots/codeGeometry';
import {useVideoConfig} from 'remotion';
import '../../shots/CodeShot.module.css';
import {makeStyles} from '../../../agentbuddy-ui/primitives/makeStyles';

const styles = makeStyles('CodeShot');

// One long code-chapter scene rendered entirely inside the app's own code
// review surface: no floating panel handoff, no browser pop-over, no
// left-pane fades. The feature panel switches commit <-> PR instantly at
// the cursor clicks, matching real app navigation.

// The cursor move to the PR tab icon runs PR_TAB_MOVE_START -> PR_TAB_CLICK_FRAME
// and clicks at its END (the move end, see codeCursorForFrame); the source
// timeline flips back to the PR panel at PR_TAB_MOVE_START, before that click
// lands. Keep the commit panel + terminal held until the click (plus a short
// land tail) so the panel switch reads as a response to the click, not a guess.
const PR_TAB_MOVE_START = 316;
const PR_TAB_CLICK_FRAME = 332; // = move end; the click ripple lands here
const PR_TAB_LAND_TAIL = 2;

export function SimpleCodeScene({frame, variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  const view = codeShotViewForFrame(frame);
  const layout = useAppWindowLayout({animate: false, variant});
  const {height, width} = useVideoConfig();
  const cursor = codeCursorForFrame(frame, layout, variant, width, height);
  const holdCommitPanel = frame > PR_TAB_MOVE_START && frame < PR_TAB_CLICK_FRAME + PR_TAB_LAND_TAIL;
  const reviewView = {
    ...view.review.view,
    // Diffs render complete in the real app; never stream lines in.
    diffLineOpacities: view.review.view.diffLineOpacities.map(() => 1),
    ...(holdCommitPanel ? {activePanel: 'commit' as const, leftSurface: 'terminal' as const} : {}),
  };
  const reviewState = holdCommitPanel
    ? {...view.review.state, terminal: expandedTerminalPanelState}
    : view.review.state;

  return (
    <div className={styles.root}>
      <div className={styles.appReveal}>
        <AppWindow activePlugin="code" breadcrumbs={view.breadcrumbs} composer={false} layout={layout}>
          <div style={{height: '100%'}}>
            <CodeReview
              state={reviewState}
              variant={variant}
              view={reviewView}
            />
          </div>
        </AppWindow>
      </div>
      {cursor ? <Cursor frame={frame} {...cursor} /> : null}
    </div>
  );
}

// A single timeline (instead of per-window moves) keeps the cursor parked
// between actions and at full opacity through every click, so each instant
// panel switch visibly responds to its click. Targets are derived from the
// real app-window box (see codeGeometry) so the cursor lands on the actual
// docked-panel elements in both the landscape and square variants.
function codeCursorForFrame(
  frame: number,
  layout: ReturnType<typeof useAppWindowLayout>,
  variant: 'landscape' | 'square' | undefined,
  width: number,
  height: number,
): CursorPath | null {
  const targets = codeCursorTargets(layout, variant, width, height);

  return cursorTimeline(targets, [
    {end: 38, from: 'stageCenter', start: 18, to: 'sourceControlIcon'},
    {end: 156, from: 'sourceControlIcon', start: 142, to: 'publishButton'},
    {end: 180, from: 'publishButton', start: 166, to: 'createPullRequestButton'},
    {end: 214, from: 'createPullRequestButton', start: 198, to: 'prDescription'},
    {end: PR_TAB_CLICK_FRAME, from: 'prDescription', start: PR_TAB_MOVE_START, to: 'prTabIcon'},
    {end: 376, from: 'prTabIcon', start: 360, to: 'createPrButton'},
    {end: 404, from: 'createPrButton', start: 392, to: 'mergePrButton'},
  ], frame, 'percent');
}
