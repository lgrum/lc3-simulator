import { describe, expect, it } from "vite-plus/test";

import { resolveTheme, themeScript } from "./theme";

describe("resolveTheme", () => {
  it("follows the system for the system preference", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
  it("uses an explicit choice whatever the system says", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});

/** Runs the inlined pre-paint script against a minimal fake document. */
function runScript(stored: string | null, systemDark: boolean) {
  const classes = new Set<string>();
  const root = {
    classList: {
      toggle: (name: string, on: boolean) =>
        on ? classes.add(name) : classes.delete(name),
    },
    style: { colorScheme: "" },
  };
  let themeColor = "";
  const document = {
    documentElement: root,
    querySelector: () => ({
      setAttribute: (_: string, value: string) => {
        themeColor = value;
      },
    }),
  };
  const localStorage = { getItem: () => stored };
  const matchMedia = () => ({ matches: systemDark });
  new Function("document", "localStorage", "matchMedia", themeScript)(
    document,
    localStorage,
    matchMedia,
  );
  return {
    dark: classes.has("dark"),
    colorScheme: root.style.colorScheme,
    themeColor,
  };
}

describe("themeScript", () => {
  it("applies the system theme when nothing is saved", () => {
    expect(runScript(null, true)).toEqual({
      dark: true,
      colorScheme: "dark",
      themeColor: "#2a2c2e",
    });
    expect(runScript(null, false)).toEqual({
      dark: false,
      colorScheme: "light",
      themeColor: "#e7e4dc",
    });
  });
  it("applies a saved choice over the system theme", () => {
    expect(runScript("light", true).dark).toBe(false);
    expect(runScript("dark", false).dark).toBe(true);
  });
  it("ignores an unknown saved value", () => {
    expect(runScript("sepia", true).dark).toBe(true);
  });
});
