import { z } from "zod";

import { GROUP_USERNAME } from "./access";
import { MIN_PASSWORD_LENGTH } from "./auth/password";

/** A student group, as the /admin page lists it. */
export type Group = {
  userId: string;
  number: number;
  name: string;
  /** How many modules the group has published. */
  modules: number;
};

/** Better Auth needs an email; groups get one that can't receive mail. */
export function groupEmail(number: number): string {
  return `group-${number}@groups.invalid`;
}

export const groupNumber = z
  .number()
  .int()
  .refine((n) => GROUP_USERNAME.test(String(n)), "Use a group number from 1");

export const groupName = z.string().trim().min(1).max(60);

/**
 * A new password: generated (a 4-word token) unless the admin typed one the
 * group chose, which needs MIN_PASSWORD_LENGTH characters.
 */
export const newPassword = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("generate") }),
  z.object({
    kind: z.literal("typed"),
    password: z.string().min(MIN_PASSWORD_LENGTH).max(128),
  }),
]);
export type NewPassword = z.infer<typeof newPassword>;

export const createGroupInput = z.object({
  number: groupNumber,
  name: groupName,
  password: newPassword,
});

export const renameGroupInput = z.object({
  userId: z.string().min(1),
  name: groupName,
});

export const resetGroupPasswordInput = z.object({
  userId: z.string().min(1),
  password: newPassword,
});

export const groupIdInput = z.object({ userId: z.string().min(1) });

/** What creating or resetting returns: a generated token is shown once. */
export type PasswordResult = { token: string | null };

/** Creating fails only when the number is taken. */
export type CreateGroupResult = PasswordResult | { problem: "exists" };
