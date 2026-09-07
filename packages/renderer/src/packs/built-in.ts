import '@default-setup/pack-entry-fe';
import { getRegisteredPlugins, getRegisteredDefaultPlugin } from '@abuddy/sdk/fe';

export default getRegisteredPlugins();
export const defaultPlugin = getRegisteredDefaultPlugin();
