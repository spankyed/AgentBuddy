export declare const router: <TInput extends import("@trpc/server/unstable-core-do-not-import").CreateRouterOptions>(input: TInput) => import("@trpc/server/unstable-core-do-not-import").BuiltRouter<{
    ctx: {
        db: import("drizzle-orm/better-sqlite3").BetterSQLite3Database<typeof import("./db/schema")> & {
            $client: import("better-sqlite3").Database;
        };
        getAgent(sessionId: string, model: string): import("xstate").Actor<import("xstate").AnyActorLogic>;
    };
    meta: object;
    errorShape: import("@trpc/server/unstable-core-do-not-import").DefaultErrorShape;
    transformer: false;
}, import("@trpc/server/unstable-core-do-not-import").DecorateCreateRouterOptions<TInput>>;
export declare const procedure: import("@trpc/server/unstable-core-do-not-import").ProcedureBuilder<{
    db: import("drizzle-orm/better-sqlite3").BetterSQLite3Database<typeof import("./db/schema")> & {
        $client: import("better-sqlite3").Database;
    };
    getAgent(sessionId: string, model: string): import("xstate").Actor<import("xstate").AnyActorLogic>;
}, object, object, typeof import("@trpc/server/unstable-core-do-not-import").unsetMarker, typeof import("@trpc/server/unstable-core-do-not-import").unsetMarker, typeof import("@trpc/server/unstable-core-do-not-import").unsetMarker, typeof import("@trpc/server/unstable-core-do-not-import").unsetMarker, false>;
//# sourceMappingURL=trpc.d.ts.map