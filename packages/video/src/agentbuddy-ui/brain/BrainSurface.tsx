import {makeStyles} from '../primitives/makeStyles';
import {BrainGraph} from './BrainGraph';
import {StepNodeDetails} from './StepNodeDetails';
import {StoppedOverlay} from './StoppedOverlay';
import {WatchedEvents} from './WatchedEvents';
import type {BrainSurfaceState} from './brainTypes';
import './BrainSurface.module.css';

const styles = makeStyles('BrainSurface');

export function BrainSurface({state}: {state: BrainSurfaceState}) {
  const selectedNode = state.graphNodes.find(node => node.id === state.selectedNodeId);
  return (
    <div className={styles.root}>
      {state.showLeftPanel ? <WatchedEvents events={state.possibleEvents} pulsingEventType={state.pulsingEventType} /> : null}
      {state.brainIsPaused ? <div className={styles.pausedBanner}><span>Brain Paused - Events Queued</span><button>Resume</button></div> : null}
      <main className={styles.canvas}>
        <BrainGraph nodes={state.graphNodes} edges={state.graphEdges} flowTNodeId={state.flowTNodeId} canGoBack={state.canGoBack} />
        {state.brainIsDead && state.graphNodes.length > 0 ? <StoppedOverlay /> : null}
      </main>
      {selectedNode ? <StepNodeDetails node={selectedNode} /> : null}
    </div>
  );
}
