/**
 * Action Export Function
 *
 * Exports all actions as a portable JSON array,
 * stripping internal fields (id, entityType, timestamps, etc.).
 */

import { repository } from '@/repository';
import { createExportDir } from '@/core/shared/paths';
import { stripInternalFields, writeExportJson } from '@/core/shared/export';

export function exportActions(outputDir: string): { filePath: string; actionCount: number } {
  outputDir = createExportDir(outputDir, 'actions');
  const actions = repository.actionQueries.all();

  const portable = stripInternalFields(actions);

  const filePath = writeExportJson(outputDir, 'exported-actions.json', portable);

  return { filePath, actionCount: portable.length };
}
