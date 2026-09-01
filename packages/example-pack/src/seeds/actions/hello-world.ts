import type { ActionMeta, Services, Z } from '../../types';

export const meta: ActionMeta = {
  label: 'Hello World',
  description: 'A simple example action from the example pack',
  category: 'example',
  input: {
    name: { type: 'string', description: 'Name to greet', required: false },
  },
};

export async function action(
  params: { name?: string },
  _services: Services,
  _z: Z,
  _flowId?: string,
) {
  const name = params.name ?? 'World';
  return { greeting: `Hello, ${name}! (from example-pack)` };
}
