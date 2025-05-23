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

export type StartupData = Record<
  keyof typeof pluginStartupLoaders,
  ReturnType<typeof pluginStartupLoaders[keyof typeof pluginStartupLoaders]>
>;

const pluginStartupLoaders = {
  agent: () => {
    return {
      messages: rows.entity.filter(byEntityType(EARS.Entity.Message)),
      contextItems: rows.entity.filter(byEntityType(EARS.Entity.ContextItem)),
      canvasContent: rows.entity.filter(byEntityType(EARS.Entity.CanvasItem))[0],
      threads: rows.entity.filter(byEntityType(EARS.Entity.Thread)),
      // currentThreadId: rows.entity.filter(byEntityType(EARS.Entity.Thread))[0].id,
    }
  }
}

export function getStartupData(): StartupData {
  const startupData = {} as StartupData;

  for (const [plugin, loader] of entries(pluginStartupLoaders)) {
    startupData[plugin] = loader();
  }

  return startupData;
}