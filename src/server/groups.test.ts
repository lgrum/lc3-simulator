import { describe, expect, it } from "vite-plus/test";

import { viewerOf } from "./access";
import {
  createGroupInput,
  groupEmail,
  resetGroupPasswordInput,
} from "./groups";

describe("createGroupInput", () => {
  const valid = {
    number: 7,
    name: "Los Siete",
    password: { kind: "generate" },
  };

  it("accepts a number, a name and a generated password", () => {
    expect(createGroupInput.parse(valid)).toEqual(valid);
  });

  it("accepts a typed password of 10 or more characters", () => {
    const typed = { kind: "typed", password: "0123456789" };
    expect(
      createGroupInput.parse({ ...valid, password: typed }).password,
    ).toEqual(typed);
  });

  it("refuses typed passwords under 10 characters", () => {
    expect(
      createGroupInput.safeParse({
        ...valid,
        password: { kind: "typed", password: "012345678" },
      }).success,
    ).toBe(false);
  });

  it("refuses numbers that wouldn't log in as a group", () => {
    for (const number of [0, -3, 1.5, 1_000_000])
      expect(createGroupInput.safeParse({ ...valid, number }).success).toBe(
        false,
      );
  });

  it("refuses blank names", () => {
    expect(createGroupInput.safeParse({ ...valid, name: "  " }).success).toBe(
      false,
    );
  });
});

describe("resetGroupPasswordInput", () => {
  it("needs a user and a password choice", () => {
    expect(
      resetGroupPasswordInput.safeParse({
        userId: "u7",
        password: { kind: "generate" },
      }).success,
    ).toBe(true);
    expect(resetGroupPasswordInput.safeParse({ userId: "u7" }).success).toBe(
      false,
    );
  });
});

describe("group accounts", () => {
  it("log in as their group", () => {
    expect(groupEmail(7)).toBe("group-7@groups.invalid");
    expect(
      viewerOf({ id: "u7", name: "x", username: String(7) }),
    ).toMatchObject({ kind: "group", group: 7 });
  });
});
