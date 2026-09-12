let BRAIN_PAUSED = false;

export function setBrainPausedState(paused: boolean) {
  BRAIN_PAUSED = paused;
}

export function isBrainPaused(): boolean {
  return BRAIN_PAUSED;
}
