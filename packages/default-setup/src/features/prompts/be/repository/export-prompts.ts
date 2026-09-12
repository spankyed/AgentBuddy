/**
 * Prompt Export Function
 *
 * Exports all prompts as a portable JSON array,
 * stripping internal fields (id, entityType, timestamps, etc.).
 */

import { repository } from '@abuddy/sdk/ears';
import { createExportDir } from '@abuddy/sdk/utils';
import { stripInternalFields, writeExportJson } from '@abuddy/sdk/utils';

export function exportPrompts(outputDir: string): { filePath: string; promptCount: number } {
  outputDir = createExportDir(outputDir, 'prompts');
  const prompts = repository.promptQueries.all();

  const portable = stripInternalFields(prompts);

  const filePath = writeExportJson(outputDir, 'exported-prompts.json', portable);

  return { filePath, promptCount: portable.length };
}
