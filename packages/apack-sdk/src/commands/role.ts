/**
 * The role a feature plays to own and serve the chat's slash commands.
 *
 * Its own leaf so that both sides can name it: the manifest schema, which refuses a provider declared by a
 * feature without it, and the app, which resolves it to ask that feature for the list. The schema is read at
 * build time and must not pull the bound-app runtime in behind this one string.
 */
export const COMMANDS_ROLE = 'commands';
