import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vite-plus/test";

import { locales } from "@/paraglide/runtime";

// The status bar links to /guide/<locale>.html for the current language.
describe("module guide", () => {
  it.each(locales)("has a page in %s", (locale) => {
    const page = new URL(`../../public/guide/${locale}.html`, import.meta.url);
    expect(existsSync(page)).toBe(true);
    expect(readFileSync(page, "utf8")).toContain(`<html lang="${locale}">`);
  });
});
