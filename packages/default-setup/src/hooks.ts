import { terminalService } from './features/code/be/services/terminal';
import { createDefaultSettings } from './features/settings/be/repository';

export const shutdown = () => terminalService.killAll();
export { createDefaultSettings };
