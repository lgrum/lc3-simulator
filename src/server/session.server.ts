import { getRequestHeaders } from "@tanstack/react-start/server";

import { viewerOf } from "./access";
import type { Viewer } from "./access";
import { getAuth } from "./auth/auth.server";

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
