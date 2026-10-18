import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { admin } from "better-auth/plugins/admin";
import { username } from "better-auth/plugins/username";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import type { DrizzleD1Database } from "drizzle-orm/d1";

import * as schema from "../db/schema";
import { refuseAdminAction } from "./admin-guard";
import {
  MIN_PASSWORD_LENGTH,
  hashPassword,
  needsRehash,
  verifyPassword,
} from "./password";
import type { Hashing } from "./password";

/** Sessions last 30 days. */
const SESSION_SECONDS = 60 * 60 * 24 * 30;

/** The hosts the app is served from; Better Auth refuses others. */
const ALLOWED_HOSTS = ["lc3.lgrum.xyz", "localhost:*", "127.0.0.1:*"];

export type AuthDeps = {
  db: DrizzleD1Database<typeof schema>;
  secret: string;
  hashing: Hashing;
};

/**
 * Better Auth for groups and admins. Groups sign in with their number as the
 * username, admins with their username; nobody can sign up. Kept free of
 * Worker imports so the Better Auth CLI can load it to generate the schema.
 */
export function createAuth({ db, secret, hashing }: AuthDeps) {
  return betterAuth({
    secret,
    baseURL: {
      allowedHosts: ALLOWED_HOSTS,
      fallback: "https://lc3.lgrum.xyz",
    },
    database: drizzleAdapter(db, { provider: "sqlite", schema }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      password: {
        hash: (password) => hashPassword(password, hashing),
        verify: ({ hash, password }) =>
          verifyPassword(hash, password, hashing.pepper),
      },
    },
    // Accounts change only through the /admin page and the CLI scripts.
    disabledPaths: [
      "/sign-up/email",
      "/sign-in/email",
      "/update-user",
      "/change-email",
      "/change-password",
      "/delete-user",
      "/request-password-reset",
      "/reset-password",
      "/is-username-available",
    ],
    session: { expiresIn: SESSION_SECONDS },
    rateLimit: {
      // In-memory limits don't work across Workers isolates.
      enabled: true,
      storage: "database",
      // A whole lab behind one IP logs in at the start of class.
      customRules: { "/sign-in/username": { window: 60, max: 30 } },
    },
    advanced: { ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] } },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        const refusal = await refuseAdminAction(
          { path: ctx.path, body: ctx.body, query: ctx.query },
          {
            roleOfUser: async (id) => {
              // The admin plugin adds `role`; the core user type lacks it.
              const user = await ctx.context.internalAdapter.findUserById(id);
              return user && "role" in user ? user.role : undefined;
            },
            userOfSession: async (token) =>
              (await ctx.context.internalAdapter.findSession(token))?.session
                .userId ?? null,
          },
        );
        if (refusal) throw new APIError("FORBIDDEN", { message: refusal });
      }),
      after: createAuthMiddleware(async (ctx) => {
        // Rehash with the configured iteration count after a successful
        // sign-in, while the password is at hand.
        const signedIn = ctx.context.newSession;
        if (ctx.path !== "/sign-in/username" || !signedIn) return;
        const password: unknown = ctx.body?.password;
        if (typeof password !== "string") return;
        const userId = signedIn.user.id;
        const account =
          await ctx.context.internalAdapter.findCredentialAccount(userId);
        if (!account?.password) return;
        if (!needsRehash(account.password, hashing.iterations)) return;
        await ctx.context.internalAdapter.updatePassword(
          userId,
          await hashPassword(password, hashing),
        );
      }),
    },
    plugins: [
      username({ minUsernameLength: 1, immutableUsername: true }),
      admin(),
      // Must be last: sets the cookies of server-side auth.api calls.
      tanstackStartCookies(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
