import type { TNodeEntity, TrackEntity } from '@app/api';

export interface NormalizedTNodeTree {
  byId: Record<string, TNodeEntity>;
  rootIds: string[];
  childrenById: Record<string, string[]>;
}

export function normalizeTNodeTree(tree: TrackEntity[]): NormalizedTNodeTree {
  const normalized: NormalizedTNodeTree = {
    byId: {},
    rootIds: [],
    childrenById: {}
  };

  function processNode(node: TrackEntity, isRoot = false) {
    const { children, ...nodeWithoutChildren } = node;
    normalized.byId[node.id] = nodeWithoutChildren as TNodeEntity;

    if (isRoot && !normalized.rootIds.includes(node.id)) {
      normalized.rootIds.push(node.id);
    }

    if (children && children.length > 0) {
      normalized.childrenById[node.id] = [
        ...new Set([
          ...(normalized.childrenById[node.id] || []),
          ...children.map(child => child.id),
        ])
      ];
      children.forEach(child => processNode(child, false));
    } else {
      normalized.childrenById[node.id] ||= [];
    }
  }

  tree.forEach(node => processNode(node, true));
  return normalized;
}

export function denormalizeTNodeTree(normalized: NormalizedTNodeTree): TrackEntity[] {
  function buildNode(id: string): TrackEntity {
    const node = normalized.byId[id];
    const childIds = normalized.childrenById[id] || [];

    return {
      ...node,
      children: childIds.map(childId => buildNode(childId))
    } as TrackEntity;
  }

  return normalized.rootIds.map(id => buildNode(id));
}

function withoutId(ids: string[], id: string): string[] {
  return ids.filter(existingId => existingId !== id);
}

export function applyTNodeSpawn(
  tree: NormalizedTNodeTree | undefined,
  tNode: TNodeEntity,
  parentId: string | undefined,
  currentFlowTNodeId: string | undefined,
): NormalizedTNodeTree {
  const isDirectFlowChild = parentId === currentFlowTNodeId;

  if (!tree) {
    return {
      byId: { [tNode.id]: tNode },
      rootIds: (!parentId || isDirectFlowChild) ? [tNode.id] : [],
      childrenById: { [tNode.id]: [] }
    };
  }

  const newTree = {
    byId: { ...tree.byId },
    rootIds: [...tree.rootIds],
    childrenById: { ...tree.childrenById }
  };

  const alreadyExists = !!newTree.byId[tNode.id];
  newTree.byId[tNode.id] = tNode;
  newTree.childrenById[tNode.id] = newTree.childrenById[tNode.id] || [];

  if (alreadyExists) {
    newTree.rootIds = withoutId(newTree.rootIds, tNode.id);
    for (const [nodeId, childIds] of Object.entries(newTree.childrenById)) {
      if (nodeId === tNode.id) continue;
      newTree.childrenById[nodeId] = withoutId(childIds, tNode.id);
    }
  }

  if (parentId && !isDirectFlowChild) {
    if (!newTree.childrenById[parentId]) {
      newTree.childrenById[parentId] = [];
    } else {
      newTree.childrenById[parentId] = [...newTree.childrenById[parentId]];
    }
    if (!newTree.childrenById[parentId].includes(tNode.id)) {
      newTree.childrenById[parentId].push(tNode.id);
    }
  } else if (!newTree.rootIds.includes(tNode.id)) {
    newTree.rootIds.push(tNode.id);
  }

  return newTree;
}
