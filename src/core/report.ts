/**
 * Surface an error without interrupting the caller, so one failing frame
 * callback or listener can't stop the others. Uses the platform's
 * `reportError` (shows up as an uncaught error) where it exists.
 */
export function report(error: unknown): void {
  const platform = (globalThis as { reportError?: (error: unknown) => void }).reportError;
  if (typeof platform === "function") platform(error);
  else console.error(error);
}
