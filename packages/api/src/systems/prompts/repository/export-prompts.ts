/**
 * Prompt Export Function
 *
 * Exports all prompts as a portable JSON array,
 * stripping internal fields (id, entityType, timestamps, etc.).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { repository } from '@/repository';
import { createExportDir } from '@/core/helpers/paths';

const INTERNAL_FIELDS = ['id', 'entityType', 'createdAt', 'updatedAt', 'deleted', 'deletedAt'] as const;

export function exportPrompts(outputDir: string): { filePath: string; promptCount: number } {
  outputDir = createExportDir(outputDir, 'prompts');
  const prompts = repository.promptQueries.all();

  const portable = prompts.map(prompt => {
    const copy = { ...prompt } as Record<string, unknown>;
    for (const field of INTERNAL_FIELDS) {
      delete copy[field];
    }
    return copy;
  });

  const filePath = path.join(outputDir, 'exported-prompts.json');

  fs.writeFileSync(filePath, JSON.stringify(portable, null, 2));

  return { filePath, promptCount: portable.length };
}
