import type { ActionMeta } from '@apackdev/sdk/build';
import type { Services, Z } from '#generated/services.ts';

export const meta: ActionMeta = {
  label: 'Check Onboarding',
  description: 'Checks whether app onboarding is unfinished',
  category: 'onboarding',
  input: {},
};

export async function action(_params: Record<string, unknown>, services: Services, _z: Z, _flowId: string) {
  return { needed: !services.appData.hasOnboarded() };
}
