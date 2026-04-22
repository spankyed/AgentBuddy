/**
 * Parse a raw block-response into a step-specific value for the
 * onboarding flow's `handle-onboarding-response` action.
 *
 * Shape contracts:
 *   welcome      → sendChoiceBlock → raw `string` (choice id, e.g. 'continue')
 *   cli-test-ask → sendChoiceBlock → raw `string` (choice id: 'yes'|'no'|'retest'|'skip')
 *   cc-import    → sendChoiceBlock → raw `string | string[]` (multiSelect project dirs)
 */

export type OnboardingStepId = 'welcome' | 'cli-test-ask' | 'cc-import';

export type ParsedStepResponse =
  | { step: 'welcome'; cancelled: boolean }
  | { step: 'cli-test-ask'; action: string; cancelled: boolean }
  | { step: 'cc-import'; selected: string[]; cancelled: boolean };

export function parseStepResponse(
  step: OnboardingStepId,
  response: unknown,
): ParsedStepResponse {
  const cancelled =
    !!response
    && typeof response === 'object'
    && (response as { cancelled?: unknown }).cancelled === true;

  switch (step) {
    case 'welcome':
      return { step: 'welcome', cancelled };

    case 'cli-test-ask': {
      const raw = typeof response === 'string' ? response : '';
      return { step: 'cli-test-ask', action: raw, cancelled };
    }

    case 'cc-import': {
      const selected = Array.isArray(response)
        ? response.filter((s): s is string => typeof s === 'string')
        : typeof response === 'string'
          ? [response]
          : [];
      return { step: 'cc-import', selected, cancelled };
    }
  }
}
