import { describe, expect, it } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { renderWorkbench } from "@/test/render-workbench";

/** main calls ONE in util.asm: 4 words of main, then 3 of util. */
const TWO_MODULES = {
  files: {
    "main.asm": [
      "        .ORIG x3000",
      "        .EXTERNAL UTIL-ONE",
      "        LD R5, PTR",
      "        JSRR R5",
      "        HALT",
      "PTR     .FILL UTIL-ONE",
      "        .END",
      "",
    ].join("\n"),
    "util.asm": [
      "ONE     AND R0, R0, #0",
      "        ADD R0, R0, #1",
      "        RET",
      "",
    ].join("\n"),
  },
  folders: [],
  entry: "main.asm",
};

describe("Status bar", () => {
  it("opens the module guide in the current language in a new tab", async () => {
    renderWorkbench();
    const link = page.getByRole("link", { name: "Module guide" });
    await expect.element(link).toHaveAttribute("href", "/guide/en.html");
    await expect.element(link).toHaveAttribute("target", "_blank");
  });

  it("counts the program's own instructions and shows its size", async () => {
    renderWorkbench(TWO_MODULES);
    const bar = page.getByRole("contentinfo");
    // main and util together, from main's .ORIG.
    await expect.element(bar).toHaveTextContent("7 words · x3000–x3006");
    await expect.element(bar).toHaveTextContent("0 instructions");

    await userEvent.click(page.getByRole("button", { name: "Continue" }));
    // LD, JSRR, AND, ADD, RET and the HALT trap; none of the OS code.
    await expect.element(bar).toHaveTextContent("6 instructions");
  });

  it("lists each module's size in the link map, with the total", async () => {
    renderWorkbench(TWO_MODULES);
    await userEvent.click(page.getByRole("tab", { name: "Link map" }));
    const rows = page.getByRole("row");
    await expect.element(rows.nth(1)).toHaveTextContent("main.asm");
    await expect.element(rows.nth(1)).toHaveTextContent("4 words");
    await expect.element(rows.nth(2)).toHaveTextContent("3 words");
    await expect.element(rows.nth(3)).toHaveTextContent("Total7 words");
  });
});
