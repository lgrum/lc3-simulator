import { describe, expect, it } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { renderWorkbench } from "@/test/render-workbench";

const dialog = page.getByRole("alertdialog");
const REPLACE_QUESTION =
  "Replace all the files in the project? Your changes are not saved anywhere else.";

async function openSquaresExample() {
  await userEvent.click(page.getByRole("button", { name: "Examples" }));
  await userEvent.click(
    page.getByRole("menuitem", { name: "Square and add, in modules" }),
  );
}

describe("Examples menu", () => {
  it("opens an example over unchanged files without asking", async () => {
    renderWorkbench();
    await expect
      .element(page.getByRole("tab", { name: "hello.asm" }))
      .toBeVisible();

    await openSquaresExample();

    await expect.element(dialog).not.toBeInTheDocument();
    await expect
      .element(page.getByRole("tab", { name: "main.asm" }))
      .toHaveAttribute("aria-selected", "true");
  });

  it("asks before replacing edited files", async () => {
    renderWorkbench();
    const editor = page.getByRole("textbox", { name: "Source of hello.asm" });
    await userEvent.click(editor);
    await userEvent.keyboard("{Control>}{Home}{/Control}; mine{Enter}");

    await openSquaresExample();
    await expect.element(dialog).toHaveTextContent(REPLACE_QUESTION);
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));
    // Declined: the edited file stays.
    await expect.element(editor).toHaveTextContent("; mine");
    await expect
      .element(page.getByRole("tab", { name: "main.asm" }))
      .not.toBeInTheDocument();

    await openSquaresExample();
    await expect.element(dialog).toHaveTextContent(REPLACE_QUESTION);
    await userEvent.click(dialog.getByRole("button", { name: "Replace" }));
    await expect
      .element(page.getByRole("tab", { name: "main.asm" }))
      .toHaveAttribute("aria-selected", "true");
    await expect
      .element(page.getByRole("tab", { name: "hello.asm" }))
      .not.toBeInTheDocument();
  });
});
