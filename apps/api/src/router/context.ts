import { db } from '@/db/client';

export const createContext = () => ({
  db,
});

export type Context = ReturnType<typeof createContext>;
