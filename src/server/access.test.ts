import { describe, expect, it } from "vite-plus/test";

import { namespaceOf, viewerOf } from "./access";

describe("viewerOf", () => {
  it("makes a group of a numeric username", () => {
    const viewer = viewerOf({ id: "u7", name: "Los Siete", username: "7" });
    expect(viewer).toEqual({
      kind: "group",
      userId: "u7",
      group: 7,
      name: "Los Siete",
    });
    expect(namespaceOf(viewer!)).toBe("group:7");
  });

  it("makes an admin of the admin role", () => {
    const viewer = viewerOf({
      id: "a1",
      name: "Prof",
      username: "prof",
      role: "admin",
    });
    expect(viewer).toMatchObject({ kind: "admin", username: "prof" });
    expect(namespaceOf(viewer!)).toBe("admin:a1");
  });

  it("refuses accounts that are neither", () => {
    expect(viewerOf({ id: "x", name: "x", username: "prof" })).toBeNull();
    expect(viewerOf({ id: "x", name: "x", username: "07" })).toBeNull();
    expect(viewerOf({ id: "x", name: "x" })).toBeNull();
  });
});
