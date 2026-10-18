import { describe, expect, it } from "vite-plus/test";

import {
  grantsAdmin,
  isAdminRole,
  refuseAdminAction,
  targetUserId,
} from "./admin-guard";
import type { UserLookup } from "./admin-guard";

const roles: Record<string, string> = {
  prof: "admin",
  other: "user,admin",
  g7: "user",
};
const lookup: UserLookup = {
  roleOfUser: (id) => Promise.resolve(roles[id]),
  userOfSession: (token) =>
    Promise.resolve(token === "prof-session" ? "prof" : "g7"),
};

describe("isAdminRole", () => {
  it("finds admin in single and combined roles", () => {
    expect(isAdminRole("admin")).toBe(true);
    expect(isAdminRole("user, admin")).toBe(true);
    expect(isAdminRole(["user", "admin"])).toBe(true);
    expect(isAdminRole("user")).toBe(false);
    expect(isAdminRole("administrator")).toBe(false);
    expect(isAdminRole(undefined)).toBe(false);
  });
});

describe("grantsAdmin", () => {
  it("catches every way to give the admin role", () => {
    expect(
      grantsAdmin({
        path: "/admin/set-role",
        body: { userId: "g7", role: "admin" },
      }),
    ).toBe(true);
    expect(
      grantsAdmin({
        path: "/admin/set-role",
        body: { userId: "g7", role: ["user", "admin"] },
      }),
    ).toBe(true);
    expect(
      grantsAdmin({ path: "/admin/create-user", body: { role: "admin" } }),
    ).toBe(true);
    expect(
      grantsAdmin({
        path: "/admin/create-user",
        body: { data: { role: "admin" } },
      }),
    ).toBe(true);
    expect(
      grantsAdmin({
        path: "/admin/update-user",
        body: { userId: "g7", data: { role: "admin" } },
      }),
    ).toBe(true);
  });

  it("lets group roles through", () => {
    expect(
      grantsAdmin({ path: "/admin/create-user", body: { role: "user" } }),
    ).toBe(false);
    expect(
      grantsAdmin({
        path: "/admin/update-user",
        body: { userId: "g7", data: { name: "x" } },
      }),
    ).toBe(false);
  });
});

describe("targetUserId", () => {
  it("reads the body's userId, or get-user's query id", () => {
    expect(
      targetUserId({ path: "/admin/ban-user", body: { userId: "g7" } }),
    ).toBe("g7");
    expect(
      targetUserId({ path: "/admin/get-user", query: { id: "prof" } }),
    ).toBe("prof");
    expect(targetUserId({ path: "/admin/list-users" })).toBeNull();
  });
});

describe("refuseAdminAction", () => {
  const touching = [
    "/admin/set-user-password",
    "/admin/ban-user",
    "/admin/remove-user",
    "/admin/set-role",
    "/admin/revoke-user-sessions",
    "/admin/impersonate-user",
    "/admin/update-user",
  ];

  it.each(touching)("refuses %s on an admin", async (path) => {
    expect(
      await refuseAdminAction(
        { path, body: { userId: "prof", role: "user", data: {} } },
        lookup,
      ),
    ).toMatch(/admins/i);
    expect(
      await refuseAdminAction(
        { path, body: { userId: "other", role: "user", data: {} } },
        lookup,
      ),
    ).toMatch(/admins/i);
  });

  it.each(touching)("allows %s on a group", async (path) => {
    expect(
      await refuseAdminAction(
        { path, body: { userId: "g7", role: "user", data: {} } },
        lookup,
      ),
    ).toBeNull();
  });

  it("refuses revoking an admin's session by token", async () => {
    expect(
      await refuseAdminAction(
        {
          path: "/admin/revoke-user-session",
          body: { sessionToken: "prof-session" },
        },
        lookup,
      ),
    ).not.toBeNull();
    expect(
      await refuseAdminAction(
        {
          path: "/admin/revoke-user-session",
          body: { sessionToken: "g7-session" },
        },
        lookup,
      ),
    ).toBeNull();
  });

  it("refuses granting the admin role", async () => {
    expect(
      await refuseAdminAction(
        { path: "/admin/create-user", body: { role: "admin" } },
        lookup,
      ),
    ).toMatch(/admin role/);
  });

  it("ignores paths outside the admin plugin", async () => {
    expect(
      await refuseAdminAction(
        { path: "/sign-in/username", body: { userId: "prof" } },
        lookup,
      ),
    ).toBeNull();
  });
});
