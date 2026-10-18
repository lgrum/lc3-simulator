import { describe, expect, it } from "vite-plus/test";

import {
  hashIterations,
  hashPassword,
  needsRehash,
  verifyPassword,
} from "./password";

const hashing = { pepper: "pepper", iterations: 1000 };

describe("hashPassword", () => {
  it("records the algorithm, iterations and salt", async () => {
    const stored = await hashPassword("correct horse", hashing);
    expect(stored).toMatch(/^pbkdf2-sha256\$1000\$[\w+/=]+\$[\w+/=]+$/);
    expect(hashIterations(stored)).toBe(1000);
  });

  it("salts every hash", async () => {
    const a = await hashPassword("same", hashing);
    const b = await hashPassword("same", hashing);
    expect(a).not.toBe(b);
  });

  it("refuses counts the Workers runtime can't run", async () => {
    await expect(
      hashPassword("x", { pepper: "p", iterations: 100_001 }),
    ).rejects.toThrow();
    await expect(
      hashPassword("x", { pepper: "p", iterations: 0 }),
    ).rejects.toThrow();
  });

  it("needs a pepper", async () => {
    await expect(
      hashPassword("x", { pepper: "", iterations: 1000 }),
    ).rejects.toThrow("pepper");
  });
});

describe("verifyPassword", () => {
  it("accepts the right password", async () => {
    const stored = await hashPassword("correct horse", hashing);
    expect(await verifyPassword(stored, "correct horse", "pepper")).toBe(true);
  });

  it("refuses a wrong password", async () => {
    const stored = await hashPassword("correct horse", hashing);
    expect(await verifyPassword(stored, "correct horse!", "pepper")).toBe(
      false,
    );
  });

  it("refuses the right password with another pepper", async () => {
    const stored = await hashPassword("correct horse", hashing);
    expect(await verifyPassword(stored, "correct horse", "other")).toBe(false);
  });

  it("verifies hashes made with another iteration count", async () => {
    const stored = await hashPassword("pw", { pepper: "p", iterations: 500 });
    expect(await verifyPassword(stored, "pw", "p")).toBe(true);
  });

  it("refuses hashes in other formats", async () => {
    expect(await verifyPassword("abc:def", "pw", "p")).toBe(false);
    expect(await verifyPassword("pbkdf2-sha256$x$a$b", "pw", "p")).toBe(false);
  });
});

describe("needsRehash", () => {
  it("is true when the configured count changed", async () => {
    const stored = await hashPassword("pw", hashing);
    expect(needsRehash(stored, 1000)).toBe(false);
    expect(needsRehash(stored, 2000)).toBe(true);
  });

  it("is true for hashes in other formats", () => {
    expect(needsRehash("salt:key", 1000)).toBe(true);
  });
});
