import {AppWindow} from '../../../agentbuddy-ui/chrome/AppWindow';
import {CodeReview} from '../../../agentbuddy-ui/code/CodeReview';
import {Cursor} from '../../overlays/Cursor';
import {cursorTimeline, percentTarget} from '../../interaction/cursorTargets';
import type {CursorPath, TargetRect} from '../../interaction/cursorTargets';
import {codeShotViewForFrame, expandedTerminalPanelState} from '../../state/code';
import {useAppWindowLayout} from '../../appWindowLayout';
import '../../shots/CodeShot.module.css';
import {makeStyles} from '../../../agentbuddy-ui/primitives/makeStyles';

const styles = makeStyles('CodeShot');

// One long code-chapter scene rendered entirely inside the app's own code
// review surface: no floating panel handoff, no browser pop-over, no
// left-pane fades. The feature panel switches commit <-> PR instantly at
// the cursor clicks, matching real app navigation.
export function SimpleCodeScene({frame, variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  const view = codeShotViewForFrame(frame);
  const layout = useAppWindowLayout({animate: false, variant});
  const cursor = codeCursorForFrame(frame);
  // The source timeline flips back to the PR panel at 316, before the
  // cursor's tab click lands at 332; hold the commit panel + terminal until
  // the click so the switch reads as a response to it.
  const holdCommitPanel = frame > 316 && frame < 334;
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
// panel switch visibly responds to its click.
function codeCursorForFrame(frame: number): CursorPath | null {
  const targets = codeCursorTargets();

  return cursorTimeline(targets, [
    {end: 38, from: 'stageCenter', start: 18, to: 'sourceControlIcon'},
    {end: 156, from: 'sourceControlIcon', start: 142, to: 'publishButton'},
    {end: 180, from: 'publishButton', start: 166, to: 'createPullRequestButton'},
    {end: 214, from: 'createPullRequestButton', start: 198, to: 'prDescription'},
    {end: 332, from: 'prDescription', start: 316, to: 'prTabIcon'},
    {end: 376, from: 'prTabIcon', start: 360, to: 'createPrButton'},
    {end: 404, from: 'createPrButton', start: 392, to: 'mergePrButton'},
  ], frame, 'percent');
}

// The docked feature panel's header icon row sits at ~15% height: folder,
// source control, pull request, search left to right.
function codeCursorTargets(): Record<string, TargetRect> {
  return {
    createPrButton: percentTarget(76.7, 86.6, 4, 3),
    createPullRequestButton: percentTarget(94.5, 25.5, 4, 3),
    mergePrButton: percentTarget(70.1, 87.3, 4, 3),
    prDescription: percentTarget(80, 39, 10, 8),
    prTabIcon: percentTarget(87.2, 13.7, 2.8, 3),
    publishButton: percentTarget(91, 19.5, 6, 3),
    sourceControlIcon: percentTarget(85, 13.7, 2.8, 3),
    stageCenter: percentTarget(46, 65, 6, 6),
  };
}
