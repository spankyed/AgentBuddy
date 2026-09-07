import { logsSystem } from '../features/logs/be/system';
import { createDefaultSettings } from '../features/settings/be/repository';
import { registerShutdownHook } from '@abuddy/sdk/utils';
import { terminalService } from '../features/code/be/services/terminal';

registerShutdownHook(() => terminalService.killAll());

export const earlyBootSystem = logsSystem;

export { createDefaultSettings };
