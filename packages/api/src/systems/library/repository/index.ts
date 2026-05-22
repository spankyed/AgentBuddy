import { registerRepository } from '@/repository';
// Library Repository - Slim index that exports queries and commands
import { libraryQueries } from './queries';
import { libraryCommands } from './commands';

export { libraryQueries } from './queries';
export { libraryCommands } from './commands';

registerRepository('libraryQueries', libraryQueries);
registerRepository('libraryCommands', libraryCommands);
