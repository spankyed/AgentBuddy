// The pack's backend lifecycle (abuddy.json boot.hooks): the app runs onInit at boot and onShutdown when it stops the pack
import { journal } from './memos/be/journal';

export const onInit = () => journal.open();

export const onShutdown = () => journal.close();
