/**
 * Reusable action definitions for seeding tests.
 */
export const actionFixtures = [
  {
    label: 'Send Email',
    description: 'Sends an email to a recipient',
    category: 'communication',
    input: { to: { type: 'string' as const, required: true }, subject: { type: 'string' as const } },
    actionFn: 'async ({ to, subject }) => sendEmail(to, subject)',
    output: { sent: true },
  },
  {
    label: 'Fetch Data',
    description: 'Fetches data from an API endpoint',
    category: 'data',
    input: { url: { type: 'string' as const, required: true } },
    actionFn: 'async ({ url }) => fetch(url).then(r => r.json())',
  },
  {
    label: 'Log Message',
    category: 'utility',
    input: {},
    actionFn: 'async ({ msg }) => console.log(msg)',
  },
];
