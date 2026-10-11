// The pack's backend lifecycle (apack.json boot.hooks): the app runs onInit at boot and onShutdown when it stops the pack
import { journal } from './memos/be/journal.ts';

export const onInit = () => journal.open();

export const onShutdown = () => journal.close();
