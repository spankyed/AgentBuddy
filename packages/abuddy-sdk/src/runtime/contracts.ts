import type { EARS } from '../types/entities';
import type { QueryBuilder, Logger } from '../ears/runtime';

// ─── Inline types (avoid circular imports from utils/, fe/) ──────────

type DiffResult<T> =
  | null
  | { renames: Array<{ from: string; to: string }>; added: T[]; removed: T[] };
type SeedCounts = { created: number; updated: number; skipped: number };
type SeedIncludeSet = true | ReadonlySet<string>;
type ImportMode = 'keep-existing' | 'replace-on-collision' | 'wipe-and-replace';
type RandomIdOptions = {
  prefix?: string;
  counterSafe?: boolean;
  length?: number;
  includeTimestamp?: boolean;
};
type ContextMenuItem = {
  label: string;
  icon?: any;
  iconColor?: string;
  event: { type: string; [key: string]: any };
  separator?: boolean;
  isActive?: boolean;
  confirm?: string;
};
type NavHistory = { entry: any; history: any[]; [key: string]: any };

/**
 * Maps every host module key to the shape the host must provide.
 *
 * - `registerHostModule(key, mod)` type-checks `mod` against this contract.
 * - `getHostModule(key)` returns the contract type instead of `any`.
 *
 * External packs can extend via declaration merging:
 * ```ts
 * declare module '@abuddy/sdk/runtime' {
 *   interface HostModuleContracts {
 *     'my-module': { doThing(x: string): number };
 *   }
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface HostModuleContracts {
  // ═══════════════════════════════════════════════════════════════════
  // EARS
  // ═══════════════════════════════════════════════════════════════════

  'attribute-storage': {
    getAttr(id: EARS.EntityId, kind: string): EARS.AttributeValue[] | null;
    removeRelation(...args: any[]): void;
    getEntitiesOfType(entityType: EARS.Entity): EARS.EntityId[];
    getAll(id: EARS.EntityId): Record<string, unknown>;
    getAllEntityTypes(): any[];
    getAllAttributeKinds(): string[];
    getAllRelationKinds(): string[];
    getAttributeStats(kind: string): { entityCount: number; totalValues: number };
    resetLmdbFiles(): void;
    clearMemory(): void;
    closePersistence(): void;
    reinitializeLmdb(): void;
    envs: Record<string, any>;
    policy: Record<string, any>;
    persistence: Record<string, any>;
  };

  'shared-repository': {
    findById<T>(id: EARS.EntityId): T | undefined;
    findByIdRaw<T>(id: EARS.EntityId): T | undefined;
    findAll<T>(entityType: EARS.Entity): T[];
    findWhere<T>(entityType: EARS.Entity, field: string, value: any): T[];
    hasIdCollision(id: EARS.EntityId): boolean;
    createEntityWithDefaults<T extends Record<string, any>>(
      entityType: EARS.Entity,
      data: Partial<T>,
      prefix?: string,
      providedId?: EARS.EntityId,
    ): T & { id: EARS.EntityId; entityType: EARS.Entity };
    updateEntity(id: EARS.EntityId, updates: Record<string, any>, skipTimestamp?: boolean): void;
    exists(id: EARS.EntityId): boolean;
    createRelation(sourceId: EARS.EntityId, relationType: EARS.RelKind, targetId: EARS.EntityId): void;
    RepositoryErrorCode: Record<string, string>;
    RepositoryError: new (message: string, code?: string, details?: any) => Error;
  };

  'query-helpers': {
    findById<T>(id: EARS.EntityId): T | undefined;
    findWhere<T>(entityType: EARS.Entity, field: string, value: any): T[];
    findAll<T>(entityType: EARS.Entity): T[];
  };

  'transaction-helpers': Record<string, any>;
  'repository': Record<string, any>;

  'ears-graph': {
    wouldCreateCycle(
      sourceId: EARS.EntityId,
      targetId: EARS.EntityId,
      relKinds: readonly string[],
    ): boolean;
  };

  'entity-utils': {
    getTimestamp(): number;
    generateShortCode(entityType: EARS.Entity, prefix?: string): string;
    generateLabelWithCount(base: string, entityType: EARS.Entity): string;
    filterSystemFields<T extends Record<string, unknown>>(
      updates: T,
      excludes?: string[],
    ): Partial<T>;
  };

  'ears-query': {
    qx(
      seed?:
        | EARS.EntityId
        | EARS.Entity
        | readonly EARS.Entity[]
        | readonly EARS.EntityId[],
    ): QueryBuilder;
    b64Encode(n: number): string;
    b64Decode(s: string): number;
  };

  'lmdb-query': Record<string, any>;

  'hydrate-sharded': {
    hydrateSharded(...args: any[]): Promise<void>;
  };

  'edge-store': Record<string, any>;
  'relation-index': Record<string, any>;

  // ═══════════════════════════════════════════════════════════════════
  // Utilities
  // ═══════════════════════════════════════════════════════════════════

  'paths': {
    getMediaPath(...args: any[]): string;
    getLmdbPath(...args: any[]): string;
    getVolatileLmdbPath(...args: any[]): string;
    getSecretsLmdbPath(...args: any[]): string;
    createExportDir(parentDir: string, systemName: string): string;
    ensureDirectoryExists(dirPath: string): void;
  };

  'media': {
    extractMediaRefs(...args: any[]): any[];
    copyMediaByRef(...args: any[]): any;
    rewriteMediaUrls(...args: any[]): string;
    copyFlatMedia(...args: any[]): any;
    resolveMedia(...args: any[]): any;
    readMediaBuffer(...args: any[]): any;
    extractAndResolveImages(...args: any[]): any[];
    stripMediaRefs(...args: any[]): string;
    restoreJsonMediaRefs(...args: any[]): { content: string; mediaRestored: number };
    restoreMarkdownMediaRefs(...args: any[]): { content: string; mediaRestored: number };
  };

  'export': {
    writeExportJson(outputDir: string, filename: string, data: unknown): string;
    writeExportFile(dir: string, filename: string, content: string): string;
    stripInternalFields<T extends object>(items: T[]): Record<string, unknown>[];
    toSlug(text: string): string;
    uniqueFilename(name: string, existingNames: Set<string>): string;
  };

  'resolve-cli': {
    resolveForService(name: string): Promise<string>;
    testCli(...args: any[]): any;
    isCliName(name: string): boolean;
    clearCliPathCache(): void;
  };

  'random-id': {
    randomId(opt?: RandomIdOptions): string;
  };

  'binary-operator': {
    BinaryOperator: Record<string, any>;
  };

  'change-detection': {
    detectChanges<T>(
      prev: T[] | undefined,
      next: T[] | undefined,
      id: (x: T) => string,
      key: (x: T) => string,
    ): DiffResult<T>;
  };

  'display-name': {
    toDisplayName(slug: string): string;
  };

  'system-errors': {
    reportSystemError(...args: any[]): void;
  };

  'seed': {
    registerSeeder(seeder: { key: string; seed(ctx: any): SeedCounts }): void;
    seedData(options: {
      compiledDir: string;
      include?: Record<string, SeedIncludeSet | undefined>;
      mode?: ImportMode;
      verbose?: boolean;
    }): Record<string, SeedCounts>;
    seedCollection<T>(opts: {
      file: string;
      label: string;
      getKey: (item: T) => string;
      findExisting: (item: T) => { id: string } | undefined;
      create: (item: T) => void;
      update: (id: string, item: T) => void;
      log: (...args: any[]) => void;
      include?: SeedIncludeSet;
      mode?: ImportMode;
      wipe?: () => void;
      getSourceHash?: (item: T) => string | undefined;
      getExistingSourceHash?: (existing: { id: string }) => string | undefined;
    }): SeedCounts;
    loadJSON<T>(filePath: string): T | null;
    shouldSeedAll(inc?: SeedIncludeSet): boolean;
    filterByInclude<T>(
      items: T[],
      getKey: (item: T) => string,
      inc?: SeedIncludeSet,
    ): T[];
  };

  'lifecycle': {
    registerShutdownHook(fn: () => void | Promise<void>): void;
    runShutdownHooks(): Promise<void>;
  };

  'version': {
    APP_VERSION: string;
  };

  'migrations': {
    runMigrations(): void;
  };

  // ═══════════════════════════════════════════════════════════════════
  // Services
  // ═══════════════════════════════════════════════════════════════════

  'event-emitter': {
    sendToPlugin(pluginId: string, event: { type: string; [key: string]: any }): void;
    sendToBrainSystem(event: {
      eventType: string;
      payload?: any;
      targetFlowId?: EARS.EntityId;
    }): void;
    sendToSystem(systemId: string, event: { type: string; [key: string]: any }): void;
    onOutgoing(callback: (event: any) => void): () => void;
    onIncoming(callback: (event: any) => void): () => void;
  };

  'services': Record<string, any>;

  // ═══════════════════════════════════════════════════════════════════
  // Frontend
  // ═══════════════════════════════════════════════════════════════════

  'breadcrumb': {
    default(
      target: string,
      label: string,
      isDefault?: boolean,
    ): { breadcrumb: { label: string; target: string; default: boolean } };
    breadcrumbWithParams<C>(opts: {
      target: string;
    } & (
      | { getLabel: (ctx: C) => string; prefix?: never; paramName?: never }
      | { getLabel?: never; prefix?: string; paramName: keyof C }
    )): { readonly breadcrumb: (ctx: C) => { label: string; target: string } };
    breadcrumbList<C>(
      getCrumbs: (ctx: C) => Array<{ label: string; target: string; info?: any }>,
    ): {
      readonly breadcrumb: (
        ctx: C,
      ) => Array<{ label: string; target: string; info?: any }>;
    };
    staticBreadcrumbList(
      crumbs: Array<{ label: string; target: string; info?: any }>,
    ): {
      readonly breadcrumb: Array<{ label: string; target: string; info?: any }>;
    };
  };

  'fe-safe-events': {
    safeEvents<T extends { type: string }>(): { [K in T['type']]: K };
  };

  'route-trailer': {
    targetIs(...args: any[]): any;
    TRAIL_CLICK: string;
  };

  'context-menu': {
    contextMenuFn<C>(
      getItems: (ctx: C) => ContextMenuItem[],
    ): { readonly contextMenu: (ctx: C) => ContextMenuItem[] };
    contextMenu(items: ContextMenuItem[]): { contextMenu: ContextMenuItem[] };
  };

  'navigate': {
    navigateToPlugin(...args: any[]): void;
  };

  'nav-history': {
    createNavHistory<T>(initialView?: T): NavHistory;
    pushNavHistory(history: NavHistory, target: string, info?: any): NavHistory;
    goBack(history: NavHistory): NavHistory;
    goForward(history: NavHistory): NavHistory;
    canGoBack(history: NavHistory): boolean;
    canGoForward(history: NavHistory): boolean;
  };

  'hotkeys': {
    createHotkeyProcessor(...args: any[]): any;
  };

  'tab-groups': {
    saveTabGroups(pluginId: string, groups: any[]): void;
    loadTabGroups(pluginId: string): any[];
    clearTabGroups(pluginId: string): void;
    getNextAvailableColor(...args: any[]): string;
    ALL_COLORS: string[];
  };

  'open-in-app-browser': {
    openInAppBrowser(url: string): void;
  };

  'settings-save-status': {
    useSettingsSaveStatus(...args: any[]): any;
  };

  'plugins': {
    useState(...args: any[]): any;
  };

  // ═══════════════════════════════════════════════════════════════════
  // Infrastructure
  // ═══════════════════════════════════════════════════════════════════

  'logger': {
    createLogger(source?: string): Logger;
    LogEvent: Record<string, any>;
  };

  'trpc': {
    trpc: Record<string, any>;
  };

  'bus-emitter': {
    rootEvents: Record<string, any>;
  };

  'router-events': Record<string, any>;
}

export type HostModuleKey = keyof HostModuleContracts;
