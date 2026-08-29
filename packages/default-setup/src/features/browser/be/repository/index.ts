import { registerRepository } from '@/repository';
import { browserQueries } from './queries';
import { browserCommands } from './commands';

export { browserQueries } from './queries';
export { browserCommands } from './commands';

registerRepository('browserQueries', browserQueries);
registerRepository('browserCommands', browserCommands);
