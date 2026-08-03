const IS_PROD = process.env.NODE_ENV === "production";

/**
 * The `detail` to attach to an error response. Upstream messages are useful when
 * developing, but in production they can carry internal URLs, query fragments or
 * driver text that a client has no business seeing — so callers get the generic
 * error only, and the full thing goes to the server log.
 */
export function publicDetail(err: unknown): string | undefined {
  if (IS_PROD) return undefined;
  return err instanceof Error ? err.message : String(err);
}
