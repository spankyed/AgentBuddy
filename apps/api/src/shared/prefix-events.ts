type Simplify<T> = { [K in keyof T]: T[K] } & {};  
 // aka “Prettify”, “Merge”, etc.
// ── Prefix‑helper that returns *simplified* members ──
export type AddPrefix<
  E extends { type: string },
  Prefix extends string
> = E extends { type: infer T extends string }
      ? Simplify<Omit<E, 'type'> & { type: `${Prefix}::${T}` }>
      : never;  