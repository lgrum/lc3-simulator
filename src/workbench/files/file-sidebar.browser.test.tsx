import { strToU8, zipSync } from "fflate";
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

/** Picks `file` in the sidebar's hidden "Open a project from .zip" input. */
function pickZip(file: File) {
  const input = document.querySelector<HTMLInputElement>(
    'input[type=file][accept^=".zip"]',
  );
  if (!input) throw new Error("No .zip input");
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("Opening a project from .zip", () => {
  const zip = (entries: Record<string, string>) =>
    new File(
      [
        zipSync(
          Object.fromEntries(
            Object.entries(entries).map(([path, text]) => [
              path,
              strToU8(text),
            ]),
          ),
        ),
      ],
      "calc.zip",
    );

  it("replaces the project after asking, and lists files left out", async () => {
    renderWorkbench({
      files: {
        "mine.asm": "        .ORIG x3000\n        HALT\n        .END\n",
      },
      folders: [],
      entry: "mine.asm",
    });
    await expect.element(item("mine.asm")).toBeVisible();

    pickZip(
      zip({
        "main.asm": "        .ORIG x3000\n        HALT\n        .END\n",
        "lib/trig.asm": "SIN     RET\n",
        "notes.txt": "notes",
      }),
    );
    const dialog = page.getByRole("alertdialog");
    await expect
      .element(dialog)
      .toHaveTextContent("Replace all the files in the project?");
    await userEvent.click(dialog.getByRole("button", { name: "Replace" }));

    await expect
      .element(dialog)
      .toHaveTextContent(
        "Only .asm files with valid module names are opened. Left out: notes.txt.",
      );
    await userEvent.click(dialog.getByRole("button", { name: "OK" }));
    await expect.element(item("mine.asm")).not.toBeInTheDocument();
    await expect.poll(() => rowText("main.asm")).toContain("entry");
    await expect
      .element(page.getByRole("tab", { name: "main.asm" }))
      .toHaveAttribute("aria-selected", "true");
  });

  it("says when a file isn't a project .zip", async () => {
    renderWorkbench();
    pickZip(new File(["not a zip"], "notes.zip"));
    await expect
      .element(page.getByRole("alertdialog"))
      .toHaveTextContent("notes.zip isn't a .zip file, or it is damaged.");
  });
});
