import { describe, expect, it } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { renderWorkbench } from "@/test/render-workbench";

describe("Editor tabs", () => {
  it("follow a JSRR into another file and mark the PC line", async () => {
    renderWorkbench({
      files: {
        "main.asm": [
          "        .ORIG x3000",
          "        .EXTERNAL LIB-INC",
          "        LD    R5, INC_PTR",
          "        JSRR  R5",
          "        HALT",
          "INC_PTR .FILL LIB-INC",
          "        .END",
          "",
        ].join("\n"),
        "lib.asm": [
          "; INC: R0 <- R0 + 1",
          "INC     ADD   R0, R0, #1",
          "        RET",
          "        .END",
          "",
        ].join("\n"),
      },
      folders: [],
      entry: "main.asm",
    });
    await expect
      .element(page.getByRole("tab", { name: "main.asm" }))
      .toHaveAttribute("aria-selected", "true");
    await expect
      .element(page.getByRole("tab", { name: "lib.asm" }))
      .not.toBeInTheDocument();

    const stepInto = page.getByRole("button", { name: "Step into" });
    await userEvent.click(stepInto); // LD
    await userEvent.click(stepInto); // JSRR

    await expect
      .element(page.getByRole("tab", { name: "lib.asm" }))
      .toHaveAttribute("aria-selected", "true");
    const editor = page.getByRole("textbox", { name: "Source of lib.asm" });
    await expect.poll(() => pcLineText(editor.element())).toMatch(/^INC\s+ADD/);
  });
});

/** The text of the line CodeMirror marks as the PC's. */
function pcLineText(content: Element): string | undefined {
  return content.querySelector(".cm-pc-line")?.textContent ?? undefined;
}
