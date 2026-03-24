/**
 * Action Export Function
 *
 * Exports all actions as a portable JSON array,
 * stripping internal fields (id, entityType, timestamps, etc.).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { repository } from '@/repository';
import { createExportDir } from '@/core/helpers/paths';

const INTERNAL_FIELDS = ['id', 'entityType', 'createdAt', 'updatedAt', 'deleted', 'deletedAt'] as const;

export function exportActions(outputDir: string): { filePath: string; actionCount: number } {
  outputDir = createExportDir(outputDir, 'actions');
  const actions = repository.actionQueries.all();

  const portable = actions.map(action => {
    const copy = { ...action } as Record<string, unknown>;
    for (const field of INTERNAL_FIELDS) {
      delete copy[field];
    }
    return copy;
  });

  const filePath = path.join(outputDir, 'exported-actions.json');

  fs.writeFileSync(filePath, JSON.stringify(portable, null, 2));

  return { filePath, actionCount: portable.length };
}
