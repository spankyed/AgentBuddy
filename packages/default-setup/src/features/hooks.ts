import { terminalService } from './code/be/services/terminal';
import { createDefaultSettings } from './settings/be/repository';

export const onInit = () => createDefaultSettings();
export const onShutdown = () => terminalService.killAll();
