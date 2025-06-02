import { rows } from './brain/mock-data';
import { EARS } from '@/shared/ears/types';
import type { MessageEntity, Rows, TagEntity, ThreadEntity } from '@/shared/types';
import { entries } from '@/shared/utils';
import type { ThreadExtended, ThreadStartupData, ThreadTagItem } from '@/types';
import { qx } from '@/shared/ears/helpers/query';
import { AgentThreadData } from './agent/types';

type Row = Rows['entity'][number]
export function byEntityType<
  K extends Row['entityType']
>(type: K): (r: Row) => r is Extract<Row, { entityType: K }> {
  return (r): r is Extract<Row, { entityType: K }> => r.entityType === type
}

type LoaderMap = typeof pluginStartupLoaders;

export type StartupData = {
  [K in keyof LoaderMap]:
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    LoaderMap[K] extends (...args: any[]) => infer R ? R : never
};

const pluginStartupLoaders = {
  agent: () => {
    const fourMostRecentThreads = qx(EARS.Entity.Thread)
      .orderBy('timestamp', 'desc')
      .limit(4)
      .rows([
        "shortCode",
        "topic",
        "instructions",
        "status",
        "timestamp",
      ] as const);
    
    const currentThread = fourMostRecentThreads[0];

    return {
      currentThread: {
        ...currentThread,
        messages: qx(currentThread.id)
          .linkRows(
            EARS.RelKind.CONTAINS,
            EARS.Entity.Message,
            ["id", "text", "sender", "timestamp"] as const,
          ) ?? [] as Partial<MessageEntity>[],
        contextItems: rows.entity.filter(byEntityType(EARS.Entity.ContextItem)),
        canvasContent: rows.entity.filter(byEntityType(EARS.Entity.CanvasItem))[0],
      } as AgentThreadData,
      threads: fourMostRecentThreads,
    }
  },
  threads: (): ThreadStartupData => {

    return {
      threads: qx(EARS.Entity.Thread)
        .map(id => {
          // pick core fields
          const base = qx(id).pickOne([
            "topic",
            "timestamp",
            "instructions",
            "threadType",
            "status",
            "shortCode",
          ] as const)!;

          // grab tags via relations
          const tags = qx(id).linkRows(
            EARS.RelKind.HAS,
            EARS.Entity.Tag,
            ["name", "color", "timestamp"] as const,
          ) as ThreadTagItem[];

          return {
            id,
            entityType: EARS.Entity.Thread,
            topic:        base.topic        || "",
            timestamp:    base.timestamp    ?? Date.now(),
            instructions: base.instructions || "",
            threadType:   base.threadType   || "work-item",
            status:       base.status       || "draft",
            shortCode:    base.shortCode,
            createdAt:    base.timestamp    ?? Date.now(),
            updatedAt:    base.timestamp    ?? Date.now(),
            ...base,
            tags,
          } as ThreadExtended;
        })
        .reverse(),
      availableTags: qx(EARS.Entity.Tag)
        .rows(["name", "color", "timestamp"] as const)
        .map(t => ({
          entityType:   EARS.Entity.Tag,
          createdAt:    t.timestamp ?? Date.now(),
          updatedAt:    t.timestamp ?? Date.now(),
          ...t,
        })) as unknown as TagEntity[]
    };
  },
}

export function getStartupData(): StartupData {
  const startupData = {} as StartupData;

  for (const [plugin, loader] of entries(pluginStartupLoaders)) {
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    startupData[plugin] = loader() as any;
  }

  return startupData;
}