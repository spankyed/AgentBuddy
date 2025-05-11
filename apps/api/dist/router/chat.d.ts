export declare const chatRouter: import("@trpc/server/unstable-core-do-not-import").BuiltRouter<{
    ctx: {
        db: import("drizzle-orm/better-sqlite3").BetterSQLite3Database<typeof import("../db/schema")> & {
            $client: import("better-sqlite3").Database;
        };
        getAgent(sessionId: string, model: string): import("xstate").Actor<import("xstate").AnyActorLogic>;
    };
    meta: object;
    errorShape: import("@trpc/server/unstable-core-do-not-import").DefaultErrorShape;
    transformer: false;
}, import("@trpc/server/unstable-core-do-not-import").DecorateCreateRouterOptions<{
    openSession: import("@trpc/server").TRPCMutationProcedure<{
        input: {
            model?: string | undefined;
        };
        output: {
            sessionId: string;
        };
    }>;
    userMessage: import("@trpc/server").TRPCMutationProcedure<{
        input: {
            sessionId: string;
            content: string;
        };
        output: void;
    }>;
    onToken: import("@trpc/server/unstable-core-do-not-import").LegacyObservableSubscriptionProcedure<{
        input: {
            sessionId: string;
        };
        output: {
            token: string;
        };
    }>;
    abort: import("@trpc/server").TRPCMutationProcedure<{
        input: {
            sessionId: string;
        };
        output: void;
    }>;
}>>;
//# sourceMappingURL=chat.d.ts.map