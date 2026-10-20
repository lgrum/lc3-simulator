import { isAdminRole } from "./auth/admin-guard";

/**
 * Who is signed in, as the app sees them. Groups sign in with their number
 * as the username; admins with a username that starts with a letter.
 */
export type Viewer =
  | { kind: "group"; userId: string; group: number; name: string }
  | { kind: "admin"; userId: string; username: string; name: string };

/** Why a sign-in failed, for the login dialog. */
export type SignInProblem = "wrong" | "rate-limited" | "unreachable";

/** The fields of a Better Auth user that decide who they are. */
export type AuthUser = {
  id: string;
  name: string;
  username?: string | null;
  role?: string | null;
};

/** A group's username: its number, without leading zeros. */
export const GROUP_USERNAME = /^[1-9]\d{0,5}$/;

export function viewerOf(user: AuthUser): Viewer | null {
  if (isAdminRole(user.role))
    return {
      kind: "admin",
      userId: user.id,
      username: user.username ?? user.name,
      name: user.name,
    };
  if (user.username && GROUP_USERNAME.test(user.username))
    return {
      kind: "group",
      userId: user.id,
      group: Number(user.username),
      name: user.name,
    };
  return null;
}

/** Where a viewer's published modules live: `group:7` or `admin:<id>`. */
export function namespaceOf(viewer: Viewer): string {
  return viewer.kind === "group"
    ? `group:${viewer.group}`
    : `admin:${viewer.userId}`;
}
