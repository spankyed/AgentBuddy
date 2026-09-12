import { terminalService } from './features/code/be/services/terminal';
import { createDefaultSettings } from './features/settings/be/repository';

export const onInit = () => createDefaultSettings();
export const onShutdown = () => terminalService.killAll();
