// How a local client reaches the app's API. Environment-agnostic on purpose: the renderer's client, the API itself,
// and local tools (`abuddy dev`, `abuddy db`, the built-in pack's watcher) all take these from here.

/** The only interface the app's API listens on: the app's own processes and local tools reach it, nothing on the network does */
export const API_HOST = '127.0.0.1';

/** The header a call to the app's API HTTP endpoints carries its token in (`AppContext.apiTokenFile`) */
export const API_TOKEN_HEADER = 'x-abuddy-api-token';
