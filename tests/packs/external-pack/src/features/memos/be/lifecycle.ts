// The memos feature's lifecycle (apack.json `features.memos.lifecycle`): the app opens its journal when the
// pack starts and closes it when the pack stops. On the feature because the journal is the feature's.
import { journal } from './journal.ts';

export const onInit = () => journal.open();

export const onShutdown = () => journal.close();
