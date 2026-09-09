import type { ActionMeta } from '@abuddy/sdk/build';

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
) {
  const name = params.name ?? 'World';
  return { greeting: `Hello, ${name}! (from example-pack)` };
}
