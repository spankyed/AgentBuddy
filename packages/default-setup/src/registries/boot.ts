import { logsSystem } from '../plugins/logs/be/system';
import { createDefaultSettings } from '../plugins/settings/be/repository';
import { registerShutdownHook } from '@abuddy/sdk/utils';
import { terminalService } from '../plugins/code/be/services/terminal';

registerShutdownHook(() => terminalService.killAll());

export const earlyBootSystem = logsSystem;

export { createDefaultSettings };
