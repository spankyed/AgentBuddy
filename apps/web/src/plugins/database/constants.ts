export const exampleQuery =
`// Example queries - modify and run to explore the database

// Query all threads (limit 10)
return qx(EARS.Entity.Thread).limit(10);

// Or try these examples:
// return qx(EARS.Entity.Agent).where('status', 'active');
// return qx().where('label').limit(20);
// return qx(EARS.Entity.Flow).linksTo('contains', EARS.Entity.Node);`

export const entityQueryTemplate = (value: string) =>
  `// Query all ${value} entities\nreturn qx(EARS.Entity.${value}).limit(20);`

export const attributeQueryTemplate = (value: string) =>
  `// Query entities with ${value} attribute\nreturn qx().where('${value}').limit(20);`

export const relationQueryTemplate = (value: string) =>
`// Query ${value} relations
const allIds = getAllEntities();
const nodes = [];
const edges = [];
const nodeSet = new Set();

// Find all relations of type '${value}'
for (const sourceId of allIds) {
  const targets = qx(sourceId).related('${value}', sourceId, true).ids();
  
  if (targets.length > 0) {
    // Add source node if not already added
    if (!nodeSet.has(sourceId)) {
      nodeSet.add(sourceId);
      nodes.push({
        id: sourceId,
        type: sourceId.split('-')[0],
        data: getAll(sourceId)
      });
    }
    
    // Add target nodes and edges
    for (const targetId of targets) {
      if (!nodeSet.has(targetId)) {
        nodeSet.add(targetId);
        nodes.push({
          id: targetId,
          type: targetId.split('-')[0],
          data: getAll(targetId)
        });
      }
      
      edges.push({
        id: \`\${sourceId}-${value}-\${targetId}\`,
        source: sourceId,
        target: targetId,
        type: '${value}'
      });
    }
  }
}

return { nodes: nodes.slice(0, 50), edges: edges.slice(0, 100) };`



export const ENTITY_COLORS: Record<string, string> = {
  Agent: '#3B82F6',
  Brain: '#8B5CF6',
  Message: '#10B981',
  Thread: '#F59E0B',
  Tag: '#EF4444',
  Relation: '#6B7280',
  ContextItem: '#14B8A6',
  CanvasItem: '#F97316',
  Flow: '#EC4899',
  Node: '#6366F1',
} as const;

export const AVAILABLE_LAYOUTS = [
  { 
    type: 'd3-force', 
    name: 'Force', 
    description: 'Force-directed layout for organic network visualization' 
  },
  { 
    type: 'circular', 
    name: 'Circular', 
    description: 'Circular layout for showing all nodes equally' 
  },
  { 
    type: 'grid', 
    name: 'Grid', 
    description: 'Grid layout for organized structure' 
  },
  { 
    type: 'radial', 
    name: 'Radial', 
    description: 'Radial layout for hierarchical visualization' 
  }
] as const;

export const GRAPH_LIMITS = {
  minZoom: 0.3,
  maxZoom: 3,
  zoomStep: 1.2,
  fitPadding: 20,
  animationDuration: 200,
} as const;

export const GRAPH_STYLES = {
  node: {
    defaultSize: 32,
    strokeWidth: 2,
    strokeColor: '#fff',
    labelFontSize: 11,
    labelOffsetY: 20,
  },
  edge: {
    strokeColor: '#E5E7EB',
    strokeWidth: 1.5,
    labelFontSize: 10,
    labelColor: '#6B7280',
    arrowSize: 8,
  },
} as const; 