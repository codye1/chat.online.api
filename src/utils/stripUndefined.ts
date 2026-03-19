export const stripUndefined = <T extends object>(obj: T): Partial<T> =>
  Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => v !== undefined),
  ) as Partial<T>;
