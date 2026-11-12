import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import type { FetchedModule } from "@/workbench/lib/library-build";
import { accountBackend, modulesBackend } from "@/test/server-api-stub";
import { renderWorkbench } from "@/test/render-workbench";

const PROJECT = {
  files: {
    "main.asm": [
      "        .ORIG x3000",
      "        .EXTERNAL G7_TRIG-SIN",
      "        LD R5, PTR",
      "        JSRR R5",
      "        HALT",
      "PTR     .FILL G7_TRIG-SIN",
      "        .END",
      "",
    ].join("\n"),
  },
  folders: [],
  entry: "main.asm",
};

const TRIG: FetchedModule = {
  name: "g7_trig",
  namespace: "group:7",
  module: "trig",
  version: 1,
  source: "SIN     ADD R0, R0, #1\n        RET\n",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Assemble key", () => {
  it("spins, ignores clicks and shows progress while fetching modules", async () => {
    vi.spyOn(accountBackend, "fetchViewer").mockResolvedValue({
      kind: "group",
      userId: "u3",
      group: 3,
      name: "Pila",
    });
    let answer = (_modules: Array<FetchedModule>) => {};
    const fetchBuild = vi
      .spyOn(modulesBackend, "fetchBuild")
      .mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    renderWorkbench(PROJECT);
    // Signed in: the build fetches published modules.
    await expect
      .element(page.getByRole("button", { name: "Other groups" }))
      .toBeInTheDocument();

    const key = page.getByRole("button", { name: "Assemble" });
    await userEvent.click(key);
    await expect.element(key).toHaveAttribute("aria-disabled", "true");
    await expect.element(key).toHaveAttribute("aria-busy", "true");
    await expect
      .element(page.getByRole("progressbar"))
      .toHaveAccessibleName("Fetching published modules: 0 of 1");
    const bar = page.getByRole("contentinfo");
    await expect
      .element(bar)
      .toHaveTextContent("Fetching published modules: 0 of 1");

    // Disabled: a forced click and Ctrl+B both leave the one build running.
    await userEvent.click(key, { force: true });
    await userEvent.keyboard("{Control>}b{/Control}");
    expect(fetchBuild).toHaveBeenCalledTimes(1);

    answer([TRIG]);
    await expect.element(key).toHaveAttribute("aria-disabled", "false");
    expect(page.getByRole("progressbar").elements()).toHaveLength(0);
    // Back to the program's size: main and group 7's trig.
    await expect.element(bar).toHaveTextContent("6 words · x3000–x3005");
    await expect
      .element(page.getByRole("treeitem", { name: "lib", exact: true }))
      .toBeInTheDocument();
  });
});
