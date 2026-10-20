import { betterAuth } from "better-auth";
import type { BetterAuthOptions, BetterAuthPlugin } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { admin } from "better-auth/plugins/admin";
import { username } from "better-auth/plugins/username";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import type { DrizzleD1Database } from "drizzle-orm/d1";

import * as schema from "../db/schema";

import { refuseAdminAction } from "./admin-guard";
import { MIN_PASSWORD_LENGTH, hashPassword, verifyAndRehash } from "./password";
import type { Hashing } from "./password";

/** Sessions last 30 days. */
const SESSION_SECONDS = 60 * 60 * 24 * 30;

/** The hosts the app is served from; Better Auth refuses others. */
const ALLOWED_HOSTS = ["lc3.lgrum.xyz", "localhost:*", "127.0.0.1:*"];

export type AuthDeps = {
  /**
   * Better Auth's own D1 (Kysely) support cost more CPU per call on the
   * deployed Worker than this Drizzle adapter (README, "Password hashing").
   */
  db: DrizzleD1Database<typeof schema>;
  secret: string;
  hashing: Hashing;
  /** Stores a rehash of a password, replacing its old stored hash. */
  replaceHash: (oldHash: string, newHash: string) => Promise<void>;
};

/**
 * Stops admin-plugin actions on admins. A plugin hook, so it runs only for
 * /admin/ paths instead of on every call.
 */
const adminGuard = {
  id: "admin-guard",
  hooks: {
    before: [
      {
        matcher: (ctx) => ctx.path?.startsWith("/admin/") ?? false,
        handler: createAuthMiddleware(async (ctx) => {
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
      },
    ],
  },
} satisfies BetterAuthPlugin;

/**
 * Better Auth for groups and admins. Groups sign in with their number as the
 * username, admins with their username; nobody can sign up. Kept free of
 * Worker imports so the Better Auth CLI can load it to generate the schema.
 */
export function createAuth({ db, secret, hashing, replaceHash }: AuthDeps) {
  return betterAuth({
    secret,
    baseURL: {
      allowedHosts: ALLOWED_HOSTS,
      fallback: "https://lc3.lgrum.xyz",
    },
    database: drizzleAdapter(db, { provider: "sqlite", schema }),
    session: { expiresIn: SESSION_SECONDS },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      password: {
        hash: (password) => hashPassword(password, hashing),
        // A password hashed with another iteration count is rehashed here,
        // while it is at hand, instead of in an after hook on every call.
        verify: ({ hash, password }) =>
          verifyAndRehash(hash, password, hashing, replaceHash),
      },
    },
    // Accounts change only through the /admin page and the CLI scripts.
    // disabledPaths only closes the HTTP routes; auth.api calls still work.
    disabledPaths: [
      "/sign-up/email",
      "/sign-in/email",
      // Signing in goes through the signIn server function (session.server.ts).
      "/sign-in/username",
      "/update-user",
      "/change-email",
      "/change-password",
      "/delete-user",
      "/request-password-reset",
      "/reset-password",
      "/is-username-available",
    ],
    // For the HTTP routes that remain; sign-in has its own limit.
    rateLimit: {
      // In-memory limits don't work across Workers isolates.
      enabled: true,
      storage: "database",
    },
    advanced: { ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] } },
    plugins: [
      username({ minUsernameLength: 1, immutableUsername: true }),
      admin(),
      adminGuard,
      // Must be last: sets the cookies of server-side auth.api calls.
      tanstackStartCookies(),
    ],
  } satisfies BetterAuthOptions);
}

export type Auth = ReturnType<typeof createAuth>;
