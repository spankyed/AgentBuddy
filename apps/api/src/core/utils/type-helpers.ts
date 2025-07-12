import type { ZodLiteral, Primitive } from "zod";

export type Simplify<T> = { [K in keyof T]: T[K] } & {};

export type MappedZodLiterals<T extends readonly Primitive[]> = {
  -readonly [K in keyof T]: ZodLiteral<T[K]>;
};