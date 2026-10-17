/**
 * The merge behind `mark.set()` and the handles' `update()`: fields given replace the current ones,
 * and a field given as undefined is removed, so it goes back to its default.
 */
export function mergeFields<T extends object>(current: T, next: Partial<T> | undefined): T {
  const result: Record<string, unknown> = { ...(current as Record<string, unknown>) };
  for (const [field, value] of Object.entries(next ?? {})) {
    if (value === undefined) delete result[field];
    else result[field] = value;
  }
  return result as T;
}
