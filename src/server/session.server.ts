import { getRequestHeaders } from "@tanstack/react-start/server";
import { APIError } from "better-auth/api";

import { viewerOf } from "./access";
import type { SignInProblem, Viewer } from "./access";
import { getAuth } from "./auth/auth.server";
import { consumeRateLimit } from "./rate-limit.server";

/** A whole lab behind one IP logs in at the start of class. */
const SIGN_IN_LIMIT = { window: 60, max: 30 };

/**
 * Logs in with a group number or admin username. Goes through auth.api, not
 * Better Auth's HTTP handler, which builds its router on every request: that
 * costs about 5 ms of the free plan's 10 ms of CPU, which the password hash
 * needs. The HTTP sign-in path is disabled, so this is the only way in, and
 * it keeps the limit of 30 sign-ins per minute per client IP.
 */
export async function signIn(
  username: string,
  password: string,
): Promise<SignInProblem | null> {
  const headers = getRequestHeaders();
  const ip = headers.get("cf-connecting-ip") ?? "unknown";
  if (!(await consumeRateLimit(`server-fn:sign-in:${ip}`, SIGN_IN_LIMIT)))
    return "rate-limited";
  try {
    // tanstackStartCookies sets the session cookie on this response.
    await getAuth().api.signInUsername({
      body: { username, password },
      headers,
    });
    return null;
  } catch (error) {
    if (error instanceof APIError && error.statusCode < 500) return "wrong";
    throw error;
  }
}

/** Ends the session of this request's cookie. */
export async function signOut(): Promise<void> {
  await getAuth().api.signOut({ headers: getRequestHeaders() });
}

/** Who sent this request, from the session cookie, or null. */
export async function getViewer(): Promise<Viewer | null> {
  const session = await getAuth().api.getSession({
    headers: getRequestHeaders(),
  });
  return session ? viewerOf(session.user) : null;
}

/** The viewer, or an error when nobody (or not the right kind) is signed in. */
export async function requireViewer<K extends Viewer["kind"]>(
  ...kinds: Array<K>
): Promise<Extract<Viewer, { kind: K }>> {
  const viewer = await getViewer();
  if (!viewer) throw new Error("Log in first");
  if (kinds.length && !kinds.includes(viewer.kind as K))
    throw new Error("You aren't allowed to do that");
  return viewer as Extract<Viewer, { kind: K }>;
}
