import {Icons} from '../primitives/Icon';
import {makeStyles} from '../primitives/makeStyles';
import type {BrainEvent, BrainGraphEdge, BrainGraphNode, BrainNode, BrainSurfaceState} from './brainTypes';
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

function WatchedEvents({events, pulsingEventType}: {events: BrainEvent[]; pulsingEventType?: string}) {
  return (
    <aside className={styles.eventsPanel}>
      <header className={styles.panelHeader}><h3>Watched Events</h3><span>{events.length} events</span></header>
      <div className={styles.eventList}>
        {events.map(event => <WatchedEvent key={event.id} event={event} active={pulsingEventType === event.eventType} />)}
      </div>
    </aside>
  );
}

function WatchedEvent({event, active}: {event: BrainEvent; active: boolean}) {
  const isSchedule = event.triggerType === 'schedule';
  const Icon = isSchedule ? Icons.Clock : Icons.Radio;
  return (
    <div className={`${styles.eventRow} ${active ? styles.eventRowActive : ''}`}>
      {active ? <div className={styles.eventScan} /> : null}
      <div className={styles.eventText}>
        <strong>{event.label}</strong>
        <span><code>{isSchedule ? event.cronExpression : event.eventType}</code><b>•</b>{isSchedule ? 'schedule' : event.scope}</span>
      </div>
      <div className={`${styles.eventIcon} ${isSchedule ? styles.eventIconSchedule : styles.eventIconListener}`}><Icon size={14} /></div>
    </div>
  );
}

function BrainGraph({nodes, edges, flowTNodeId, canGoBack}: {nodes: BrainGraphNode[]; edges: BrainGraphEdge[]; flowTNodeId?: string; canGoBack?: boolean}) {
  const byId = new Map(nodes.map(node => [node.id, node]));
  return (
    <div className={styles.graph} data-onboarding-id="brain-flow-graph">
      <svg className={styles.edges}>
        <defs><marker id="brain-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L8,4 L0,8 z" fill="rgb(115 115 115)" /></marker></defs>
        {edges.map(edge => {
          const source = byId.get(edge.source);
          const target = byId.get(edge.target);
          if (!source || !target) return null;
          const start = {x: source.x + 80, y: source.y};
          const end = {x: target.x - 80, y: target.y};
          const midX = start.x + (end.x - start.x) * 0.55;
          const d = `M ${start.x} ${start.y} C ${midX} ${start.y}, ${midX} ${end.y}, ${end.x} ${end.y}`;
          return <path key={edge.id} className={`${styles.edge} ${edge.animated ? styles.edgeActive : ''}`} d={d} markerEnd="url(#brain-arrow)" />;
        })}
      </svg>
      {canGoBack ? <button className={styles.back}><Icons.ArrowLeft size={14} /> Back</button> : null}
      {flowTNodeId ? <div className={styles.currentLabel}>{flowTNodeId}</div> : null}
      <button className={styles.fit}><Icons.Maximize size={16} /></button>
      {nodes.map(node => <BrainGraphNodeView key={node.id} node={node} />)}
    </div>
  );
}

function BrainGraphNodeView({node}: {node: BrainGraphNode}) {
  const Icon = iconForNode(node);
  return (
    <div className={`${styles.graphNode} ${styles[`node_${node.stepNodeType || node.tNodeType}`]}`} style={{left: node.x, top: node.y}}>
      <div className={styles.nodeHeader}><Icon size={14} /><span>{node.label}</span></div>
      {node.eventType ? <div className={styles.nodeSubtitle}>{node.eventType}</div> : null}
      {node.status ? <span className={`${styles.statusDot} ${styles[`status_${node.status}`]}`} /> : null}
    </div>
  );
}

function TracePanel({nodes}: {nodes: BrainNode[]}) {
  return (
    <aside className={styles.tracePanel}>
      <header className={styles.panelHeader}><h3>Event Trace</h3><span>{nodes.length} events</span></header>
      <div className={styles.traceList}>{nodes.map(node => <TraceNode key={node.id} node={node} depth={0} />)}</div>
    </aside>
  );
}

function TraceNode({node, depth}: {node: BrainNode; depth: number}) {
  const Icon = iconForNode(node);
  return (
    <div className={styles.traceItem} style={{marginLeft: depth * 14}}>
      <button className={`${styles.traceHeader} ${styles[`trace_${node.stepNodeType || node.tNodeType}`]}`}>
        {node.children?.length || node.nodeAttributes ? <Icons.ChevronRight size={14} /> : <span className={styles.traceSpacer} />}
        <span className={styles.traceDot} />
        <span className={styles.traceLabel}>{node.label}</span>
        {node.startedAt ? <span className={styles.traceTime}>{node.startedAt}</span> : null}
        <Icon size={14} />
        {node.status ? <span className={`${styles.traceStatus} ${styles[`status_${node.status}`]}`} /> : null}
      </button>
      {node.children?.slice(0, 2).map(child => <TraceNode key={child.id} node={child} depth={depth + 1} />)}
    </div>
  );
}

function StepNodeDetails({node}: {node: BrainNode}) {
  return (
    <aside className={styles.details} data-onboarding-id="brain-step-details">
      <header className={styles.detailsHeader}>
        <div><h3>{node.label}</h3><span className={styles.detailsMeta}>{node.status} {node.stepNodeType ? <b>{node.stepNodeType}</b> : null}</span></div>
        <button><Icons.X size={18} /></button>
      </header>
      <div className={styles.detailsBody}>
        {node.nodeAttributes ? <DataSection title="Input Parameters" data={node.nodeAttributes} /> : null}
        {node.output ? <DataSection title="Output Result" data={node.output} /> : null}
      </div>
      <footer className={styles.execution}><h4>Execution Info</h4><div><span>Started: <b>{node.startedAt}</b></span><span>Duration: <b>{node.duration}</b></span></div></footer>
    </aside>
  );
}

function DataSection({title, data}: {title: string; data: unknown}) {
  return <section className={styles.dataSection}><h4>{title}</h4><pre>{JSON.stringify(data, null, 2)}</pre></section>;
}

function StoppedOverlay() {
  return <div className={styles.stopped}><div><div className={styles.stoppedIcon}><Icons.X size={28} /></div><p>Brain Stopped</p><span>This is the last known state</span><button>Start Brain</button></div></div>;
}

function iconForNode(node: BrainNode) {
  if (node.tNodeType === 'event') return Icons.Radio;
  switch (node.stepNodeType) {
    case 'listener': return Icons.Radio;
    case 'schedule': return Icons.Clock;
    case 'flow': return Icons.Network;
    case 'llm': return Icons.Sparkle;
    case 'switch': return Icons.Split;
    case 'fire': return Icons.Zap;
    case 'kill': return Icons.Plug;
    default: return Icons.Play;
  }
}
