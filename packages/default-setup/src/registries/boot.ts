import { logsSystem } from '../features/logs/be/system';
import { createDefaultSettings } from '../features/settings/be/repository';
import { terminalService } from '../features/code/be/services/terminal';

export const earlyBootSystem = logsSystem;

export const shutdownHook = () => terminalService.killAll();

export { createDefaultSettings };
