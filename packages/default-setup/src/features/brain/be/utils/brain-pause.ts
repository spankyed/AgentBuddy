/**
 * A synchronous mirror of the brain system's state, for `flow-system.ts` to read while deciding whether to
 * defer a step — it cannot await a snapshot. The machine is authoritative: `running.paused`
 * (`../system.ts`) is what the UI is told from on every publish. Five actions there write it and each sits
 * beside the transition it mirrors — `PAUSE_BRAIN` and `RESUME_BRAIN`, and `startBrain`, `killBrain` and
 * `restartBrain`, which set it back to `false` — so the flag and the state cannot survive one another.
 * Nothing persists paused, so there is no stored value for a reload to contradict. A sixth writer, or one
 * that does not accompany a transition, is what would break that.
 */
let BRAIN_PAUSED = false;

export function setBrainPausedState(paused: boolean) {
  BRAIN_PAUSED = paused;
}

export function isBrainPaused(): boolean {
  return BRAIN_PAUSED;
}
