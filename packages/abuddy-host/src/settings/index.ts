// Default-setup's settings and secrets, as the host reads and writes them: the SDK's BuiltinRepositories
// contract, which default-setup's repositories are checked against (builtin-repositories.spec.ts)
export { builtinRepository as settingsRepository } from '@abuddy/sdk/ears/internals';
