import { EARS } from '@/shared/ears/types';
import type { MessageEntity, Rows, TagEntity, ThreadEntity } from '@/shared/types';
import type { ThreadExtended, ThreadStartupData, ThreadTagItem } from '@/types';
import { qx } from '@/shared/ears/helpers/query';

export default function threadStartupData(): ThreadStartupData {
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
          topic: base.topic || "",
          timestamp: base.timestamp ?? Date.now(),
          instructions: base.instructions || "",
          threadType: base.threadType || "work-item",
          status: base.status || "draft",
          shortCode: base.shortCode,
          createdAt: base.timestamp ?? Date.now(),
          updatedAt: base.timestamp ?? Date.now(),
          ...base,
          tags,
        } as ThreadExtended;
      })
      .reverse(),
    availableTags: qx(EARS.Entity.Tag)
      .rows(["name", "color", "timestamp"] as const)
      .map(t => ({
        entityType: EARS.Entity.Tag,
        createdAt: t.timestamp ?? Date.now(),
        updatedAt: t.timestamp ?? Date.now(),
        ...t,
      })) as unknown as TagEntity[]
  };
}