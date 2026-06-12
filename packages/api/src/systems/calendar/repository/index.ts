import { registerRepository } from '@/repository';
import { calendarQueries } from './queries';
import { calendarCommands } from './commands';

export { calendarQueries } from './queries';
export { calendarCommands } from './commands';

registerRepository('calendarQueries', calendarQueries);
registerRepository('calendarCommands', calendarCommands);
