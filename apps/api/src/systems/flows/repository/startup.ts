import { EARS } from '@/shared/ears/types';
import { qx } from '@/shared/ears/helpers/query';
import { getRootFlow } from './read';
import { FlowsStartupData, EdgeEntity, StepEntity, FlowEntity } from '../types';
import { edgeStore } from '@/shared/ears/helpers/edge-store';


export default function flowsStartupData(): FlowsStartupData {
  const flowCols = ["id", "label", "flowType", "status", "createdAt"] as const;

  const flows = qx(EARS.Entity.Flow)
    .orderBy('createdAt', 'desc')
    .pick(flowCols) as Partial<FlowEntity>[];

  const rootFlow = qx(EARS.Entity.Flow)
    .withRole(EARS.RoleKind.Custom("root_flow"))
    .pickOne(flowCols) as Partial<FlowEntity> | undefined;
    
  const stepNodes = qx(rootFlow?.id ?? 'Flow-1')
    .linksPick(
      EARS.RelKind.CONTAINS,
      [EARS.Entity.Step, EARS.Entity.FlowEvent],          // we only want the step‑like children
      [
        'label',
        'stepType',
        'createdAt',
        'x',
        'y',
      ] as const,
  ) as Partial<StepEntity>[];

  const stepIds = stepNodes.map(n => n.id!).filter(Boolean);

  const seen = new Set<string>();
  const edges: EdgeEntity[] = [];
  const edgeKinds = [
    EARS.RelKind.TRANSITIONS_TO,
    EARS.RelKind.EMITS,
    EARS.RelKind.CONSUMED_BY,
  ]

  for (const source of stepIds) {
    qx(source)
      .links(edgeKinds, [EARS.Entity.Step, EARS.Entity.FlowEvent]) // ! need to combine with FlowEvent
      .forEach(({ relation, id: target }) => {
        const relId = edgeStore.relIds({
          sourceEntity: source,
          relationType: relation,
          targetEntity: target,
        })[0];

        if (seen.has(relId)) return;
        seen.add(relId);
        edges.push({
          id: relId,
          kind: relation,
          source,
          target,
          info: {},
        });
      });
  }

  return {
    graph: {
      nodes: stepNodes,
      edges,
    },
    flows,
    rootFlow,
  };
}