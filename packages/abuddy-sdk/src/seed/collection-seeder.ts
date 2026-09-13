import { createEntityWithDefaults, updateEntity, destroyEntity } from '../ears/index';
import { findWhere, findAll, findById } from '../ears/internals';
import { seedCollection, type Seeder, type SeederContext, type SeedCounts } from '../utils/index';
import { seedPath } from '../build/manifest';

export function createCollectionSeeder(config: {
  key: string;
  entityType: any;
  lookupField: string;
}): Seeder {
  const { key, entityType, lookupField } = config;
  const label = key.replace(/s$/, '');

  return {
    key,
    seed(ctx: SeederContext): SeedCounts {
      return seedCollection<any>({
        file: seedPath(ctx.compiledDir, key),
        label,
        getKey: (item: any) => item[lookupField],
        findExisting: (item: any) => findWhere(entityType as any, lookupField, item[lookupField])[0] as any,
        create: (item: any) => createEntityWithDefaults(entityType as any, item),
        update: (id: any, item: any) => updateEntity(id, item),
        log: ctx.log,
        include: ctx.include,
        mode: ctx.mode,
        wipe: () => {
          for (const e of findAll(entityType as any)) destroyEntity((e as any).id);
        },
        getSourceHash: (item: any) => item.sourceHash,
        getExistingSourceHash: (existing: any) => (findById((existing as any).id) as any)?.sourceHash,
      });
    },
  };
}
