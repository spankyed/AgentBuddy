import type { ActionMeta } from '@apack/sdk/build';
import type { Services, Z } from '#generated/services.ts';

export const meta: ActionMeta = {
  label: '__LABEL__',
  description: '',
  category: '__CATEGORY__',
  input: {},
};

export async function action(
  params: Record<string, any>,
  services: Services,
  z: Z,
  flowId: string,
) {
  // Action implementation
}
