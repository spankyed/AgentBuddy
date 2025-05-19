import type { ECS } from "./types";

interface RelationIndex {
  [relationType: string]: {
    bySource: { [sourceEntityID: string]: ECS.EntityId[] };
    byTarget: { [targetEntityID: string]: ECS.EntityId[] };
  };
}

export const relationIndex: RelationIndex = {};

export function addToIndex(relationType: string, sourceEntityID: ECS.EntityId, targetEntityID: ECS.EntityId, relationEntityID: ECS.EntityId): void {
  if (!relationIndex[relationType]) {
    relationIndex[relationType] = { bySource: {}, byTarget: {} };
  }
  if (!relationIndex[relationType].bySource[sourceEntityID]) {
    relationIndex[relationType].bySource[sourceEntityID] = [];
  }
  if (!relationIndex[relationType].byTarget[targetEntityID]) {
    relationIndex[relationType].byTarget[targetEntityID] = [];
  }

  relationIndex[relationType].bySource[sourceEntityID].push(relationEntityID);
  relationIndex[relationType].byTarget[targetEntityID].push(relationEntityID);
}

export function removeFromIndex(relationType: string, sourceEntityID: ECS.EntityId, targetEntityID: ECS.EntityId, relationEntityID: ECS.EntityId): void {
  relationIndex[relationType].bySource[sourceEntityID] = relationIndex[relationType].bySource[sourceEntityID].filter(id => id !== relationEntityID);
  relationIndex[relationType].byTarget[targetEntityID] = relationIndex[relationType].byTarget[targetEntityID].filter(id => id !== relationEntityID);
}

export function updateIndex(
  relationType: string,
  relationEntityID: ECS.EntityId,
  oldSourceEntityID: ECS.EntityId,
  oldTargetEntityID: ECS.EntityId,
  newSourceEntityID?: ECS.EntityId,
  newTargetEntityID?: ECS.EntityId,
): void {
  if (newSourceEntityID && oldSourceEntityID !== newSourceEntityID) {
    removeFromIndex(relationType, oldSourceEntityID, oldTargetEntityID, relationEntityID);
    addToIndex(relationType, newSourceEntityID, oldTargetEntityID, relationEntityID);
  }

  if (newTargetEntityID && oldTargetEntityID !== newTargetEntityID) {
    removeFromIndex(relationType, oldSourceEntityID, oldTargetEntityID, relationEntityID);
    addToIndex(relationType, oldSourceEntityID, newTargetEntityID, relationEntityID);
  }
}
