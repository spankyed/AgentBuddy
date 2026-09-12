import { registerRepository } from '@abuddy/sdk/ears';
import { noteQueries } from './queries';
import { noteCommands } from './commands';

export { noteQueries } from './queries';
export { noteCommands } from './commands';
export { syncReferences, parseNoteLinks } from './link-utils';

registerRepository('noteQueries', noteQueries);
registerRepository('noteCommands', noteCommands);
