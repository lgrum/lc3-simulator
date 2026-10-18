import { getRequestHeaders } from "@tanstack/react-start/server";
import { asc, count, eq, isNotNull } from "drizzle-orm";
import { APIError } from "better-auth/api";

import { viewerOf } from "./access";
import { getAuth } from "./auth/auth.server";
import { generateToken } from "./auth/tokens";
import { db } from "./db/client.server";
import { modules, user } from "./db/schema";
import { groupEmail } from "./groups";
import type {
  CreateGroupResult,
  Group,
  NewPassword,
  PasswordResult,
} from "./groups";

/** Every group, by number. Admins never appear. */
export async function listGroups(): Promise<Array<Group>> {
  const rows = await db
    .select({
      userId: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
      modules: count(modules.id),
    })
    .from(user)
    .leftJoin(modules, eq(modules.ownerUserId, user.id))
    .where(isNotNull(user.username))
    .groupBy(user.id)
    .orderBy(asc(user.username));
  return rows
    .flatMap((row) => {
      const viewer = viewerOf({ id: row.userId, ...row });
      return viewer?.kind === "group"
        ? [
            {
              userId: row.userId,
              number: viewer.group,
              name: row.name,
              modules: row.modules,
            },
          ]
        : [];
    })
    .sort((a, b) => a.number - b.number);
}

/** The group with this user id, or an error: admins are never groups. */
export async function findGroup(userId: string) {
  const row = await db.query.user.findFirst({ where: eq(user.id, userId) });
  const viewer = row && viewerOf(row);
  if (viewer?.kind !== "group") throw new Error("There is no such group");
  return viewer;
}

function passwordOf(password: NewPassword): PasswordResult & { value: string } {
  if (password.kind === "typed")
    return { token: null, value: password.password };
  const token = generateToken();
  return { token, value: token };
}

/** Runs a Better Auth call as the requesting admin. */
const asAdmin = () => ({ headers: getRequestHeaders() });

export async function createGroup(input: {
  number: number;
  name: string;
  password: NewPassword;
}): Promise<CreateGroupResult> {
  const { token, value } = passwordOf(input.password);
  try {
    await getAuth().api.createUser({
      body: {
        email: groupEmail(input.number),
        password: value,
        name: input.name,
        role: "user",
        data: { username: String(input.number) },
      },
      ...asAdmin(),
    });
  } catch (error) {
    // The number's email or username is taken.
    if (error instanceof APIError && error.status === "BAD_REQUEST")
      return { problem: "exists" };
    throw error;
  }
  return { token };
}

export async function renameGroup(userId: string, name: string) {
  await findGroup(userId);
  await getAuth().api.adminUpdateUser({
    body: { userId, data: { name } },
    ...asAdmin(),
  });
}

/** Sets a new password and logs the group's members out. */
export async function resetGroupPassword(
  userId: string,
  password: NewPassword,
): Promise<PasswordResult> {
  await findGroup(userId);
  const { token, value } = passwordOf(password);
  const auth = getAuth();
  await auth.api.setUserPassword({
    body: { userId, newPassword: value },
    ...asAdmin(),
  });
  await auth.api.revokeUserSessions({ body: { userId }, ...asAdmin() });
  return { token };
}

/** Deletes a group with its sessions and published modules. */
export async function deleteGroup(userId: string) {
  await findGroup(userId);
  // D1 enforces the foreign keys, so the group's modules and versions go too.
  await getAuth().api.removeUser({ body: { userId }, ...asAdmin() });
}
