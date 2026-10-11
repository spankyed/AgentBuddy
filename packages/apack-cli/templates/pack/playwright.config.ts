import { definePackE2EConfig } from '@apack/testing/playwright';

// Everything a pack's E2E suite needs: `tests/e2e`, the suite's timeout, one worker — the app locks its
// data dir, so two would fight over it — and output beside the suite. Pass anything Playwright takes.
export default definePackE2EConfig();
