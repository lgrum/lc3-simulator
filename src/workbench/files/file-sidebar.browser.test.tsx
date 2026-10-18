import { describe, expect, it } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { renderWorkbench } from "@/test/render-workbench";

// The sidebar is a labelled div, not a landmark.
const sidebar = page.getByLabelText("Files", { exact: true });
const item = (name: string) =>
  sidebar.getByRole("treeitem", { name, exact: true });
/** The text of a file's whole row: its tree item plus badges. */
const rowText = (path: string) =>
  document.querySelector(`[role=treeitem][title="${path}"]`)?.closest("li")
    ?.textContent ?? null;

async function rowAction(path: string, action: string) {
  await userEvent.click(
    page.getByRole("button", { name: `Actions for ${path}` }),
  );
  await userEvent.click(page.getByRole("menuitem", { name: action }));
}

describe("File sidebar", () => {
  it("creates, renames, sets the entry and deletes files", async () => {
    renderWorkbench({
      files: {
        "main.asm": "        .ORIG x3000\n        HALT\n        .END\n",
      },
      folders: [],
      entry: "main.asm",
    });
    await expect.poll(() => rowText("main.asm")).toContain("entry");

    // A name other files can't import by is refused with the reason.
    await userEvent.click(sidebar.getByRole("button", { name: "New file" }));
    await expect.element(page.getByLabelText("File name")).toHaveFocus();
    await userEvent.keyboard("1bad{Enter}");
    await expect
      .element(sidebar.getByRole("alert"))
      .toHaveTextContent(/Other files import this file by its name/);
    await expect.element(item("1bad.asm")).not.toBeInTheDocument();

    await userEvent.keyboard("{Control>}a{/Control}util{Enter}");
    await expect.element(item("util.asm")).toBeVisible();
    await expect
      .element(page.getByRole("tab", { name: "util.asm" }))
      .toHaveAttribute("aria-selected", "true");

    // Rename selects the name without .asm, so typing replaces just that.
    await rowAction("util.asm", "Rename");
    await expect
      .element(page.getByLabelText("New name for util.asm"))
      .toHaveFocus();
    await userEvent.keyboard("helpers{Enter}");
    await expect.element(item("helpers.asm")).toBeVisible();
    await expect.element(item("util.asm")).not.toBeInTheDocument();
    await expect
      .element(page.getByRole("tab", { name: "helpers.asm" }))
      .toHaveAttribute("aria-selected", "true");

    // Give the new file a program of its own at x4000.
    await userEvent.click(
      page.getByRole("textbox", { name: "Source of helpers.asm" }),
    );
    await userEvent.keyboard(
      "{Control>}a{/Control}.ORIG x4000{Enter}HALT{Enter}.END",
    );

    await rowAction("helpers.asm", "Set as entry");
    await expect.poll(() => rowText("helpers.asm")).toContain("entry");
    await expect.poll(() => rowText("main.asm")).not.toContain("entry");

    await userEvent.click(page.getByRole("button", { name: /^Assemble/ }));
    await expect
      .element(page.getByRole("row", { name: /^PC/ }))
      .toHaveTextContent("x4000");

    // The entry file can't be deleted; any other file asks first.
    await userEvent.click(
      page.getByRole("button", { name: "Actions for helpers.asm" }),
    );
    await expect
      .element(page.getByRole("menuitem", { name: "Delete helpers.asm" }))
      .toHaveAttribute("aria-disabled", "true");
    await userEvent.keyboard("{Escape}");

    await rowAction("main.asm", "Delete main.asm");
    const dialog = page.getByRole("alertdialog");
    await expect
      .element(dialog)
      .toHaveTextContent("Delete main.asm? This can't be undone.");
    await userEvent.click(dialog.getByRole("button", { name: "Delete" }));
    await expect.element(item("main.asm")).not.toBeInTheDocument();
    await expect
      .element(page.getByRole("tab", { name: "main.asm" }))
      .not.toBeInTheDocument();
  });
});
