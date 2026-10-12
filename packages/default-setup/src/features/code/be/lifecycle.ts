// The code feature's teardown: the terminals it spawned are child processes, which outlive the actor that
// started them, so they are killed here rather than in a system's exit action.
import { terminalService } from './services/terminal.ts';

export const onShutdown = () => {
  terminalService.killAll();
};
