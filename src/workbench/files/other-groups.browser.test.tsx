import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { accountBackend, modulesBackend } from "@/test/server-api-stub";
import { renderWorkbench } from "@/test/render-workbench";

const TRIG = "SIN     ADD R0, R0, #1\n        RET\n";

/** Signed in as group 3; group 7 has published `trig` up to v4. */
function signInAsGroup3() {
  vi.spyOn(accountBackend, "fetchViewer").mockResolvedValue({
    kind: "group",
    userId: "u3",
    group: 3,
    name: "Pila",
  });
  vi.spyOn(modulesBackend, "listGroups").mockResolvedValue([
    {
      number: 7,
      name: "Los Bits",
      modules: [{ id: 70, name: "trig", latest: 4, updatedAt: 0 }],
    },
  ]);
  vi.spyOn(modulesBackend, "listVersions").mockResolvedValue([
    { id: 704, number: 4, createdAt: 0 },
    { id: 703, number: 3, createdAt: 0 },
  ]);
  const getSource = vi
    .spyOn(modulesBackend, "getSource")
    .mockResolvedValue({ id: 704, module: "trig", number: 4, source: TRIG });
  return { getSource };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Other groups", () => {
  it("stays hidden when nobody is signed in", async () => {
    renderWorkbench();
    await expect
      .element(page.getByRole("button", { name: "New file" }))
      .toBeInTheDocument();
    expect(
      page.getByRole("button", { name: "Other groups" }).elements(),
    ).toHaveLength(0);
  });

  it("opens another group's latest module read-only in the editor", async () => {
    const { getSource } = signInAsGroup3();
    renderWorkbench();

    await userEvent.click(page.getByRole("button", { name: "Other groups" }));
    await userEvent.click(
      page.getByRole("button", { name: "Group 7 · Los Bits" }),
    );
    await userEvent.click(page.getByRole("button", { name: "g7_trig" }));

    expect(getSource).toHaveBeenCalledWith(704);
    const tab = page.getByRole("tab", { name: /g7_trig\.asm/ });
    await expect.element(tab).toHaveTextContent("g7_trig.asmv4 · read-only");
    await expect.element(tab).toHaveAttribute("aria-selected", "true");
    const editor = page.getByRole("textbox", { name: /g7_trig\.asm/ });
    await expect.element(editor).toHaveTextContent("SIN ADD R0, R0, #1");
    await expect.element(editor).toHaveAttribute("aria-readonly", "true");
  });
});
