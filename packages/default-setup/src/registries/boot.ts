import { createDefaultSettings } from '../features/settings/be/repository';
import { terminalService } from '../features/code/be/services/terminal';

export const shutdownHook = () => terminalService.killAll();

export { createDefaultSettings };
