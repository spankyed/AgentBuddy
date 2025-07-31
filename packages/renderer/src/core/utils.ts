export const entries = <T extends Record<string, unknown>>(obj: T) =>
  Object.entries(obj) as Array<[keyof T, T[keyof T]]>

export function capitalizeFirstLetter(string: string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}