/** Host lifecycle state; completing onboarding grants no access to reset, import or export app data. */
export interface OnboardingService {
  /** Whether the user finished onboarding. Resetting preferences leaves this state unchanged. */
  isComplete(): boolean;
  /** Records completion; resetting the whole app starts onboarding again. */
  complete(): void;
}
