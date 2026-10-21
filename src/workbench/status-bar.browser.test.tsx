import { describe, expect, it } from "vite-plus/test";
import { page } from "vite-plus/test/browser";

import { renderWorkbench } from "@/test/render-workbench";

describe("Status bar", () => {
  it("opens the module guide in the current language in a new tab", async () => {
    renderWorkbench();
    const link = page.getByRole("link", { name: "Module guide" });
    await expect.element(link).toHaveAttribute("href", "/guide/en.html");
    await expect.element(link).toHaveAttribute("target", "_blank");
  });
});
