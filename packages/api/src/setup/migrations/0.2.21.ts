import { envs } from '@/core/ears/attribute-storage';
import type { Migration } from './index';

const SEP = '\x1F';

export const migration: Migration = {
  target: '0.2.21',
  description: 'Backfill relBySrc/relByTgt secondary indexes for LMDB relation lookups',
  up: () => {
    const { relations, relBySrc, relByTgt, entities } = envs.primary;

    // Idempotent: skip if already populated
    const first = relBySrc.getRange({ limit: 1 })[Symbol.iterator]().next();
    if (!first.done) {
      console.log('[migration] relBySrc already populated, skipping backfill');
      return;
    }

    let count = 0;
    const srcMap = new Map<string, string[]>();
    const tgtMap = new Map<string, string[]>();

    for (const { key, value: rel } of relations.getRange()) {
      if (!rel?.kind || !rel?.src || !rel?.tgt) continue;
      const relId = String(key);

      const srcKey = `${rel.kind}${SEP}${rel.src}`;
      const tgtKey = `${rel.kind}${SEP}${rel.tgt}`;

      if (!srcMap.has(srcKey)) srcMap.set(srcKey, []);
      srcMap.get(srcKey)!.push(relId);

      if (!tgtMap.has(tgtKey)) tgtMap.set(tgtKey, []);
      tgtMap.get(tgtKey)!.push(relId);

      count++;
    }

    // Write all indexes in a single transaction
    entities.transactionSync(() => {
      for (const [key, relIds] of srcMap) relBySrc.put(key, relIds);
      for (const [key, relIds] of tgtMap) relByTgt.put(key, relIds);
    });

    console.log(`[migration] Backfilled secondary indexes for ${count} relations (${srcMap.size} src keys, ${tgtMap.size} tgt keys)`);
  },
};
