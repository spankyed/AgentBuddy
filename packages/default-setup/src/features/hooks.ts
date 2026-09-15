import { terminalService } from './code/be/services/terminal';
import { createDefaultSettings } from './settings/be/repository';
import { clearAllSchedules } from './brain/be/services/scheduler';
import { removeAllListeners as removeAllAdHocListeners } from './brain/be/services/brain';
import { clearFlowActorRegistry } from './brain/be/flow-system';

export const onInit = () => createDefaultSettings();

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
