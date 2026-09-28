import { terminalService } from './code/be/services/terminal.ts';
import { clearAllSchedules } from './brain/be/services/scheduler.ts';
import { removeAllListeners as removeAllAdHocListeners } from './brain/be/services/brain.ts';
import { clearFlowActorRegistry } from './brain/be/flow-system.ts';

export const onInit = () => {};

/**
 * The pack's backend stopped (the app exiting or unloading the pack, a test app stopping): its stopped actors never
 * reach the brain's kill, so drop what outlives them here, or cron jobs keep sending the brain events
 */
export const onShutdown = () => {
  terminalService.killAll();
  clearAllSchedules();
  removeAllAdHocListeners();
  clearFlowActorRegistry();
};
