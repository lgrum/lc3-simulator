import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { renderWorkbench } from "@/test/render-workbench";

const dialog = page.getByRole("dialog");

async function openExport() {
  await userEvent.click(
    page.getByRole("button", { name: "File", exact: true }),
  );
  await userEvent.click(
    page.getByRole("menuitem", { name: "Export program…" }),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Export program", () => {
  it("shows the assembled program in hex, origin first, to copy", async () => {
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);
    renderWorkbench();
    await openExport();

    const hex = dialog.getByLabelText("Program in hex");
    await expect.element(hex).toHaveTextContent(/^3000 E002 /);
    await expect
      .element(dialog)
      .not.toHaveTextContent("Files changed since the last assemble");

    await userEvent.click(dialog.getByRole("button", { name: "Copy hex" }));
    expect(writeText).toHaveBeenCalledWith(hex.element().textContent);
    await expect
      .element(dialog.getByRole("button", { name: "Copied" }))
      .toBeVisible();
  });

  it("copies a selection of the columns with spaces", async () => {
    renderWorkbench();
    await openExport();
    const hex = dialog.getByLabelText("Program in hex");
    await expect.element(hex).toHaveTextContent(/^3000 E002 /);

    getSelection()?.selectAllChildren(hex.element());
    const event = new ClipboardEvent("copy", {
      bubbles: true,
      cancelable: true,
      clipboardData: new DataTransfer(),
    });
    hex.element().dispatchEvent(event);
    expect(event.clipboardData?.getData("text/plain")).toBe(
      hex.element().textContent,
    );
  });

  it("downloads the program as a .obj file named after the entry", async () => {
    const names: Array<string> = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      names.push(this.download);
    });
    renderWorkbench();
    await openExport();
    await userEvent.click(
      dialog.getByRole("button", { name: "Download .obj" }),
    );
    expect(names).toEqual(["hello.obj"]);
  });

  it("warns when files changed since the last assemble", async () => {
    renderWorkbench();
    const editor = page.getByRole("textbox", { name: "Source of hello.asm" });
    await userEvent.click(editor);
    await userEvent.keyboard("{Control>}{Home}{/Control}; mine{Enter}");
    await openExport();
    await expect
      .element(dialog)
      .toHaveTextContent("Files changed since the last assemble");
  });
});
