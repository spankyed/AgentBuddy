export declare const createContext: () => {
    db: import("drizzle-orm/better-sqlite3").BetterSQLite3Database<typeof import("./db/schema")> & {
        $client: import("better-sqlite3").Database;
    };
    getAgent(sessionId: string, model: string): import("xstate").Actor<import("xstate").AnyActorLogic>;
};
export type Context = ReturnType<typeof createContext>;
//# sourceMappingURL=context.d.ts.map