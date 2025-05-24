import { rows } from './mock-data';
import { EARS } from '@/shared/ears/types';
import type { Rows } from '@/shared/types';
import { entries } from '@/shared/utils';

type Row = Rows['entity'][number]
function byEntityType<
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
    return {
      messages: rows.entity.filter(byEntityType(EARS.Entity.Message)),
      contextItems: rows.entity.filter(byEntityType(EARS.Entity.ContextItem)),
      canvasContent: rows.entity.filter(byEntityType(EARS.Entity.CanvasItem))[0],
      threads: rows.entity.filter(byEntityType(EARS.Entity.Thread)),
      // currentThreadId: rows.entity.filter(byEntityType(EARS.Entity.Thread))[0].id,
    }
  },
  threads: () => {
    const threads = rows.entity.filter(byEntityType(EARS.Entity.Thread));

    return {
      threads,
    }
  }
}

export function getStartupData(): StartupData {
  const startupData = {} as StartupData;

  for (const [plugin, loader] of entries(pluginStartupLoaders)) {
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    startupData[plugin] = loader() as any;
  }

  return startupData;
}