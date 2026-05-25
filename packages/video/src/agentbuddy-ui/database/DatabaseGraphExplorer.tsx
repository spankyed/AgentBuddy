import {Icons} from '../primitives/Icon';
import {makeStyles} from '../primitives/makeStyles';
import type {DatabaseGraphNode, DatabaseGraphState} from './databaseTypes';
import {DatabaseGraphLegend, databaseGraphEntityColors} from './DatabaseGraphLegend';
import {DatabaseGraphToolbar} from './DatabaseGraphToolbar';
import './DatabaseGraphExplorer.module.css';

const styles = makeStyles('DatabaseGraphExplorer');

type DatabaseGraphExplorerProps = {
  state: DatabaseGraphState;
};

export function DatabaseGraphExplorer({state}: DatabaseGraphExplorerProps) {
  const selectedNode = state.nodes.find(node => node.id === state.selectedNodeId);
  const hasData = state.nodes.length > 0;

  return (
    <div className={styles.root}>
      <DatabaseGraphToolbar state={state} />
      <div className={styles.canvasRegion}>
        <div className={styles.canvas}>
          {hasData ? <GraphPreview state={state} /> : null}
        </div>
        {!hasData && !state.isLoading ? <EmptyState /> : null}
        {state.isLoading ? <LoadingState /> : null}
        {selectedNode ? <NodeInfoPanel node={selectedNode} /> : null}
      </div>
      <DatabaseGraphLegend />
    </div>
  );
}

function GraphPreview({state}: {state: DatabaseGraphState}) {
  const nodePositions = layoutNodes(state.nodes);
  return (
    <svg className={styles.graphSvg} viewBox="0 0 900 480">
      <defs>
        <marker id="database-graph-arrow" markerHeight="6" markerWidth="6" orient="auto-start-reverse" refX="5" refY="3">
          <path d="M0,0 L6,3 L0,6 Z" fill="#6b7280" />
        </marker>
      </defs>
      {state.edges.map(edge => {
        const source = nodePositions.get(edge.source);
        const target = nodePositions.get(edge.target);
        if (!source || !target) return null;
        return (
          <line
            className={styles.edge}
            key={edge.id}
            markerEnd="url(#database-graph-arrow)"
            x1={source.x}
            x2={target.x}
            y1={source.y}
            y2={target.y}
          />
        );
      })}
      {state.nodes.map(node => {
        const point = nodePositions.get(node.id);
        if (!point) return null;
        const color = databaseGraphEntityColors[node.type ?? 'Node'] ?? databaseGraphEntityColors.Node;
        return (
          <g className={styles.node} key={node.id} transform={`translate(${point.x} ${point.y})`}>
            <circle fill={color} r="18" stroke="#fff" strokeWidth="2" />
            <text dy="40">{node.label ?? labelFromId(node.id)}</text>
          </g>
        );
      })}
    </svg>
  );
}

function layoutNodes(nodes: DatabaseGraphNode[]) {
  const centerX = 450;
  const centerY = 240;
  const radiusX = 280;
  const radiusY = 150;
  const positions = new Map<string, {x: number; y: number}>();
  nodes.forEach((node, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(nodes.length, 1) - Math.PI / 2;
    positions.set(node.id, {
      x: centerX + Math.cos(angle) * radiusX,
      y: centerY + Math.sin(angle) * radiusY,
    });
  });
  return positions;
}

function EmptyState() {
  return (
    <div className={styles.empty}>
      <div className={styles.emptyIconWrap}>
        <Icons.Database size={64} />
        <Icons.Database className={styles.emptyPing} size={64} />
      </div>
      <h4>No Data to Display</h4>
      <p>Run a query to visualize the results</p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className={styles.loading}>
      <Icons.Loader2 className={styles.loadingSpinner} size={48} />
      <h4>Loading Graph</h4>
      <p>Please wait while we prepare your visualization</p>
    </div>
  );
}

function NodeInfoPanel({node}: {node: DatabaseGraphNode}) {
  const additional = Object.entries(node).filter(([key]) => !['id', 'type', 'label', 'connections'].includes(key));
  return (
    <div className={styles.infoPanel}>
      <div className={styles.infoHeader}>
        <h4>Node Details</h4>
        <button title="Close panel" type="button"><Icons.X size={12} /></button>
      </div>
      <div className={styles.infoFields}>
        <InfoField label="ID" monospace value={node.id} />
        <InfoField label="Type" value={node.type ?? 'Unknown'} />
        <InfoField label="Label" value={node.label ?? node.id} />
        {node.connections !== undefined ? <InfoField label="Connections" value={`${node.connections} edges`} /> : null}
        {additional.length > 0 ? (
          <div className={styles.properties}>
            <h5>Properties</h5>
            {additional.map(([key, value]) => <InfoField key={key} label={titleCase(key)} small value={typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)} />)}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function InfoField({label, monospace, small, value}: {label: string; monospace?: boolean; small?: boolean; value: string}) {
  return (
    <div className={small ? styles.infoFieldSmall : styles.infoField}>
      <span>{label}</span>
      <strong className={monospace ? styles.monospace : undefined}>{value}</strong>
    </div>
  );
}

function labelFromId(id: string) {
  const parts = id.split('-');
  return parts[parts.length - 1] || id;
}

function titleCase(key: string) {
  return key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
}
