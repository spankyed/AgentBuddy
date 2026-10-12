// The brain's teardown. Its stopped actors never reach their own cleanup — `enqueue.stopChild` may be
// interrupted mid-exit — so what outlives them is dropped here, or cron jobs keep sending the brain events
// after the pack has gone.
import { clearAllSchedules } from './services/scheduler.ts';
import { removeAllListeners as removeAllAdHocListeners } from './services/brain.ts';
import { clearFlowActorRegistry } from './flow-system.ts';

export const onShutdown = () => {
  clearAllSchedules();
  removeAllAdHocListeners();
  clearFlowActorRegistry();
};
