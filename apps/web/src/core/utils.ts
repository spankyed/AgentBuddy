export const entries = <T extends Record<string, unknown>>(obj: T) =>
  Object.entries(obj) as Array<[keyof T, T[keyof T]]>