import { EARS } from '@/shared/ears/types';
import { qx } from '@/shared/ears/helpers/query';
import { getRootFlow } from './read';
import { FlowsStartupData, EdgeEntity, NodeEntity, FlowEntity } from '../types';
import { edgeStore } from '@/shared/ears/helpers/edge-store';


export default function flowsStartupData(): FlowsStartupData {
  const flowCols = ["id", "label", "flowType", "status", "createdAt"] as const;

  const flows = qx(EARS.Entity.Flow)
    .orderBy('createdAt', 'desc')
    .pick(flowCols) as Partial<FlowEntity>[];

  const rootFlow = qx(EARS.Entity.Flow)
    .withRole(EARS.RoleKind.Custom("root_flow"))
    .pickOne(flowCols) as Partial<FlowEntity> | undefined;
    
  const nodes = qx(rootFlow?.id ?? 'Flow-1')
    .linksPick(
      EARS.RelKind.CONTAINS,
      [EARS.Entity.Node],          // we only want the node children
      [
        'label',
        'nodeType',
        'createdAt',
        'x',
        'y',
      ] as const,
  ) as Partial<NodeEntity>[];

  const nodeIds = nodes.map(n => n.id!).filter(Boolean);

  const seen = new Set<string>();
  const edges: EdgeEntity[] = [];
  const edgeKinds = [
    EARS.RelKind.TRANSITIONS_TO,
    EARS.RelKind.EMITS,
    EARS.RelKind.CONSUMED_BY,
  ]

  for (const source of nodeIds) {
    qx(source)
      .links(edgeKinds, [EARS.Entity.Node])
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
      nodes,
      edges,
    },
    flows,
    rootFlow,
  };
}