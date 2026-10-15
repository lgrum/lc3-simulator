import { describe, expect, it, vi } from "vite-plus/test";

import worker from "./worker";

function makeEnvironment() {
  const put = vi.fn().mockResolvedValue(undefined);
  const environment = {
    ASSETS: { fetch: vi.fn() },
    GROUP_PASSWORDS: JSON.stringify(
      Object.fromEntries(
        [
          1, 3, 4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 18, 19, 20, 21, 22, 23, 24,
          27, 30,
        ].map((group, index) => [
          String(group),
          index === 0 ? "group-one-secret" : `group-${group}-secret`,
        ]),
      ),
    ),
    SUBMISSIONS: { put },
  };

  return { environment, put };
}

function makeSubmissionRequest({
  group = "1",
  password = "group-one-secret",
  filename = "program.asm",
  content = ".ORIG x3000\nHALT\n.END",
}: {
  group?: string;
  password?: string;
  filename?: string;
  content?: string;
} = {}) {
  const form = new FormData();
  form.set("group", group);
  form.set("password", password);
  form.set("file", new File([content], filename), filename);

  return new Request("https://lc3.lgrum.xyz/api/submissions", {
    method: "POST",
    body: form,
  });
}

describe("submission worker", () => {
  it("stores an authenticated assembly under the group's canonical filename", async () => {
    const { environment, put } = makeEnvironment();
    const response = await worker.fetch(makeSubmissionRequest(), environment);

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ filename: "grupo1.asm" });
    expect(put).toHaveBeenCalledWith(
      "grupo1.asm",
      expect.any(File),
      expect.objectContaining({
        httpMetadata: { contentType: "text/plain; charset=utf-8" },
      }),
    );
  });

  it("uses the actual group number in the stored filename", async () => {
    const { environment, put } = makeEnvironment();
    const response = await worker.fetch(
      makeSubmissionRequest({ group: "30", password: "group-30-secret" }),
      environment,
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ filename: "grupo30.asm" });
    expect(put).toHaveBeenCalledWith(
      "grupo30.asm",
      expect.any(File),
      expect.any(Object),
    );
  });

  it("rejects an incorrect group password without storing the file", async () => {
    const { environment, put } = makeEnvironment();
    const response = await worker.fetch(
      makeSubmissionRequest({ password: "wrong" }),
      environment,
    );

    expect(response.status).toBe(401);
    expect(put).not.toHaveBeenCalled();
  });

  it("rejects groups outside the provided group list", async () => {
    const { environment, put } = makeEnvironment();
    const response = await worker.fetch(
      makeSubmissionRequest({ group: "2" }),
      environment,
    );

    expect(response.status).toBe(400);
    expect(put).not.toHaveBeenCalled();
  });

  it("rejects files that do not have the assembly extension", async () => {
    const { environment, put } = makeEnvironment();
    const response = await worker.fetch(
      makeSubmissionRequest({ filename: "program.txt" }),
      environment,
    );

    expect(response.status).toBe(400);
    expect(put).not.toHaveBeenCalled();
  });

  it("rejects files larger than 1 MiB", async () => {
    const { environment, put } = makeEnvironment();
    const response = await worker.fetch(
      makeSubmissionRequest({ content: "x".repeat(1024 * 1024 + 1) }),
      environment,
    );

    expect(response.status).toBe(413);
    expect(put).not.toHaveBeenCalled();
  });

  it("requires a configured password for every group", async () => {
    const { environment, put } = makeEnvironment();
    environment.GROUP_PASSWORDS = JSON.stringify({ "1": "group-one-secret" });
    const response = await worker.fetch(makeSubmissionRequest(), environment);

    expect(response.status).toBe(503);
    expect(put).not.toHaveBeenCalled();
  });
});
