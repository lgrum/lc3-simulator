/**
 * Admins manage groups through Better Auth's admin plugin, but must never
 * touch another admin: admin accounts are created, reset and deleted only
 * with the CLI scripts. These checks run before every admin-plugin action.
 */

export const ADMIN_ROLE = "admin";

/** Whether a Better Auth role field (`"admin"`, `"user,admin"`...) is admin. */
export function isAdminRole(role: unknown): boolean {
  const roles = Array.isArray(role)
    ? role
    : typeof role === "string"
      ? role.split(",")
      : [];
  return roles.some((r) => typeof r === "string" && r.trim() === ADMIN_ROLE);
}

export type AdminAction = {
  /** The endpoint path, e.g. `/admin/set-role`. */
  path: string;
  body?: unknown;
  query?: unknown;
};

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

/** Whether the action would give someone the admin role. */
export function grantsAdmin({ path, body }: AdminAction): boolean {
  if (path === "/admin/set-role" || path === "/admin/create-user")
    if (isAdminRole(field(body, "role"))) return true;
  if (path === "/admin/create-user" || path === "/admin/update-user")
    return isAdminRole(field(field(body, "data"), "role"));
  return false;
}

/** The user an action applies to, when it names one by id. */
export function targetUserId({
  path,
  body,
  query,
}: AdminAction): string | null {
  const id =
    path === "/admin/get-user" ? field(query, "id") : field(body, "userId");
  return typeof id === "string" || typeof id === "number" ? String(id) : null;
}

/** The session token an action applies to, e.g. revoking one session. */
export function targetSessionToken({ body }: AdminAction): string | null {
  const token = field(body, "sessionToken");
  return typeof token === "string" ? token : null;
}

export type UserLookup = {
  roleOfUser: (userId: string) => Promise<unknown>;
  userOfSession: (token: string) => Promise<string | null>;
};

/**
 * Why an admin-plugin action is refused, or null when it may go ahead. Only
 * `/admin/*` paths are checked.
 */
export async function refuseAdminAction(
  action: AdminAction,
  lookup: UserLookup,
): Promise<string | null> {
  if (!action.path.startsWith("/admin/")) return null;
  if (grantsAdmin(action)) return "Admins can't grant the admin role";
  const token = targetSessionToken(action);
  const userId =
    targetUserId(action) ??
    (token === null ? null : await lookup.userOfSession(token));
  if (userId !== null && isAdminRole(await lookup.roleOfUser(userId)))
    return "Admins can't change other admins";
  return null;
}
