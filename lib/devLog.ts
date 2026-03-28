/**
 * Logs to the console in development only. Use in catch blocks when the user
 * already sees a toast or inline error — helps debug without shipping noise.
 */
export function devError(context: string, err: unknown): void {
  if (process.env.NODE_ENV !== 'development') return;
  if (err instanceof Error) {
    console.error(`[${context}]`, err.message, err);
  } else {
    console.error(`[${context}]`, err);
  }
}
