import { describe, expect, it } from "vite-plus/test";

import { MIN_PASSWORD_LENGTH } from "./password";
import { generateToken, wordCount } from "./tokens";

describe("generateToken", () => {
  it("is four lowercase words joined by -", () => {
    expect(generateToken()).toMatch(/^[a-z]+(-[a-z]+){3}$/);
  });

  it("is long enough to pass the typed-password minimum", () => {
    for (let i = 0; i < 50; i++)
      expect(generateToken().length).toBeGreaterThanOrEqual(
        MIN_PASSWORD_LENGTH,
      );
  });

  it("draws from hundreds of words", () => {
    expect(wordCount()).toBeGreaterThanOrEqual(512);
  });
});
