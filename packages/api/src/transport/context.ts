// The context every tRPC call gets. Empty: what a procedure needs, it takes from the bound app.
export const createContext = () => ({});

export type Context = ReturnType<typeof createContext>;
