import { backfillCodexSessionArtifacts } from '@/setup/reconcile-codex-state';
import type { Migration } from './index';

export const migration: Migration = {
  target: '0.3.1',
  description: 'Backfill Codex session artifact markers',
  up: () => {
    backfillCodexSessionArtifacts();
  },
};
