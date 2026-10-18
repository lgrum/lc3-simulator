import { describe, expect, it } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { renderWorkbench } from "@/test/render-workbench";

describe("Problems tab", () => {
  it("opens the file of a clicked problem with the cursor on its line", async () => {
    renderWorkbench({
      files: {
        "main.asm": "        .ORIG x3000\n        HALT\n        .END\n",
        "lib.asm":
          "; helpers\nF       ADD R0, R0, #1\n        BOGUS R1\n        RET\n        .END\n",
      },
      folders: [],
      entry: "main.asm",
    });

    // The failed first assemble brings the Problems tab forward.
    const problem = page.getByRole("button", { name: /lib\.asm line 3/ });
    await expect.element(problem).toBeVisible();
    await expect
      .element(page.getByRole("tab", { name: "lib.asm" }))
      .not.toBeInTheDocument();

    await userEvent.click(problem);

    await expect
      .element(page.getByRole("tab", { name: "lib.asm" }))
      .toHaveAttribute("aria-selected", "true");
    const editor = page.getByRole("textbox", { name: "Source of lib.asm" });
    await expect.element(editor).toHaveFocus();
    await expect.poll(() => activeLineNumber(editor.element())).toBe("3");
  });
});

/** The line number CodeMirror shows next to the cursor. */
function activeLineNumber(content: Element): string | undefined {
  return content
    .closest(".cm-editor")
    ?.querySelector(".cm-lineNumbers .cm-activeLineGutter")
    ?.textContent?.trim();
}
