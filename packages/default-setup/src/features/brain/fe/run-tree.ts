import type { RunNode, RunTree } from '@apackdev/sdk/steps'

export interface NormalizedRunNodeTree {
  byId: Record<string, RunNode>;
  rootIds: string[];
  childrenById: Record<string, string[]>;
}

export function normalizeRunNodeTree(tree: RunTree[]): NormalizedRunNodeTree {
  const normalized: NormalizedRunNodeTree = {
    byId: {},
    rootIds: [],
    childrenById: {}
  };

  function processNode(node: RunTree, isRoot = false) {
    const { children, ...nodeWithoutChildren } = node;
    normalized.byId[node.id] = nodeWithoutChildren as RunNode;

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

export function denormalizeRunNodeTree(normalized: NormalizedRunNodeTree): RunTree[] {
  function buildNode(id: string): RunTree {
    const node = normalized.byId[id];
    const childIds = normalized.childrenById[id] || [];

    return {
      ...node,
      children: childIds.map(childId => buildNode(childId))
    } as RunTree;
  }

  return normalized.rootIds.map(id => buildNode(id));
}

function withoutId(ids: string[], id: string): string[] {
  return ids.filter(existingId => existingId !== id);
}

export function applyRunNodeSpawn(
  tree: NormalizedRunNodeTree | undefined,
  runNode: RunNode,
  parentId: string | undefined,
  currentFlowRunNodeId: string | undefined,
): NormalizedRunNodeTree {
  const isDirectFlowChild = parentId === currentFlowRunNodeId;

  if (!tree) {
    return {
      byId: { [runNode.id]: runNode },
      rootIds: (!parentId || isDirectFlowChild) ? [runNode.id] : [],
      childrenById: { [runNode.id]: [] }
    };
  }

  const newTree = {
    byId: { ...tree.byId },
    rootIds: [...tree.rootIds],
    childrenById: { ...tree.childrenById }
  };

  const alreadyExists = !!newTree.byId[runNode.id];
  newTree.byId[runNode.id] = runNode;
  newTree.childrenById[runNode.id] = newTree.childrenById[runNode.id] || [];

  if (alreadyExists) {
    newTree.rootIds = withoutId(newTree.rootIds, runNode.id);
    for (const [nodeId, childIds] of Object.entries(newTree.childrenById)) {
      if (nodeId === runNode.id) continue;
      newTree.childrenById[nodeId] = withoutId(childIds, runNode.id);
    }
  }

  if (parentId && !isDirectFlowChild) {
    if (!newTree.childrenById[parentId]) {
      newTree.childrenById[parentId] = [];
    } else {
      newTree.childrenById[parentId] = [...newTree.childrenById[parentId]];
    }
    if (!newTree.childrenById[parentId].includes(runNode.id)) {
      newTree.childrenById[parentId].push(runNode.id);
    }
  } else if (!newTree.rootIds.includes(runNode.id)) {
    newTree.rootIds.push(runNode.id);
  }

  return newTree;
}
