import { beforeAll, describe, expect, it, vi } from "vite-plus/test";

import worker from "./worker";

const GROUP_NUMBERS = [
  1, 3, 4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 18, 19, 20, 21, 22, 23, 24, 27, 30,
];
const GROUP_PASSWORD = "group-one-secret";
let groupPasswordHash = "";

interface TestGroup {
  group_id: string;
  active: number;
  password_hash: string | null;
}

interface TestSession {
  token_hash: string;
  role: "group" | "admin";
  subject: string;
  expires_at: number;
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: 600_000 },
    key,
    256,
  );
  return `pbkdf2-sha256$600000$${encodeBase64(salt)}$${encodeBase64(new Uint8Array(bits))}`;
}

async function hashToken(token: string): Promise<string> {
  const bits = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return encodeBase64(new Uint8Array(bits));
}

class MemoryDatabase {
  groups = new Map<string, TestGroup>(
    GROUP_NUMBERS.map((group) => [
      String(group),
      {
        group_id: String(group),
        active: 1,
        password_hash: group === 1 ? groupPasswordHash : null,
      },
    ]),
  );
  sessions = new Map<string, TestSession>();
  attempts: Array<{ address: string; attempted_at: number }> = [];

  prepare(query: string) {
    let values: Array<string | number | null> = [];
    return {
      bind: (...parameters: Array<string | number | null>) => {
        values = parameters;
        return this.prepareBound(query, () => values);
      },
      first: async <T>() => this.read<T>(query, values),
      run: async () => this.write(query, values),
      all: async <T>() => this.readAll<T>(query),
    };
  }

  async batch(
    statements: Array<{
      run: () => Promise<{ meta?: { changes?: number } }>;
    }>,
  ) {
    const results = [];
    for (const statement of statements) {
      results.push(await statement.run());
    }
    return results;
  }

  private prepareBound(
    query: string,
    getValues: () => Array<string | number | null>,
  ) {
    return {
      first: async <T>() => this.read<T>(query, getValues()),
      run: async () => this.write(query, getValues()),
      all: async <T>() => this.readAll<T>(query),
      bind: (...parameters: Array<string | number | null>) => {
        let values = parameters;
        return {
          first: async <T>() => this.read<T>(query, values),
          run: async () => this.write(query, values),
          all: async <T>() => this.readAll<T>(query),
          bind: (...next: Array<string | number | null>) => {
            values = next;
            return this.prepareBound(query, () => values);
          },
        };
      },
    };
  }

  private async read<T>(
    query: string,
    values: Array<string | number | null>,
  ): Promise<T | null> {
    if (query.includes("COUNT(*) AS count FROM login_attempts")) {
      const [address, since] = values as [string, number];
      return {
        count: this.attempts.filter(
          (attempt) =>
            attempt.address === address && attempt.attempted_at > since,
        ).length,
      } as T;
    }
    if (query.includes("FROM groups WHERE group_id = ?")) {
      return (this.groups.get(String(values[0])) as T | undefined) ?? null;
    }
    if (query.includes("FROM sessions WHERE token_hash = ?")) {
      const session = this.sessions.get(String(values[0]));
      if (!session || session.expires_at <= Number(values[1])) return null;
      return session as T;
    }
    return null;
  }

  private async readAll<T>(query: string): Promise<{ results: Array<T> }> {
    if (query.includes("FROM groups ORDER BY")) {
      const results = [...this.groups.values()]
        .sort((left, right) => Number(left.group_id) - Number(right.group_id))
        .map((group) => ({
          group_id: group.group_id,
          active: group.active,
          password_configured: group.password_hash ? 1 : 0,
        }));
      return { results: results as Array<T> };
    }
    return { results: [] };
  }

  private async write(
    query: string,
    values: Array<string | number | null>,
  ): Promise<{ meta: { changes: number } }> {
    let changes = 0;
    if (query.includes("SELECT ?, 'group', group_id")) {
      const [token_hash, expires_at, subject, password_hash] = values as [
        string,
        number,
        string,
        string,
      ];
      const group = this.groups.get(subject);
      if (group?.active === 1 && group.password_hash === password_hash) {
        this.sessions.set(token_hash, {
          token_hash,
          role: "group",
          subject,
          expires_at,
        });
        changes = 1;
      }
    } else if (query.startsWith("INSERT INTO sessions")) {
      const [token_hash, role, subject, expires_at] = values as [
        string,
        "group" | "admin",
        string,
        number,
      ];
      this.sessions.set(token_hash, {
        token_hash,
        role,
        subject,
        expires_at,
      });
      changes = 1;
    } else if (query.startsWith("INSERT INTO login_attempts")) {
      this.attempts.push({
        address: String(values[0]),
        attempted_at: Number(values[1]),
      });
      changes = 1;
    } else if (query.startsWith("DELETE FROM login_attempts")) {
      const previousLength = this.attempts.length;
      this.attempts = this.attempts.filter(
        (attempt) => attempt.attempted_at >= Number(values[0]),
      );
      changes = previousLength - this.attempts.length;
    } else if (query.startsWith("DELETE FROM sessions WHERE token_hash")) {
      changes = Number(this.sessions.delete(String(values[0])));
    } else if (query.includes("UPDATE groups SET password_hash")) {
      const group = this.groups.get(String(values[2]));
      if (
        group &&
        (values.length === 3 || group.password_hash === values[3]) &&
        group.active === 1
      ) {
        group.password_hash = String(values[0]);
        changes = 1;
      }
    } else if (query.includes("UPDATE groups SET active")) {
      const group = this.groups.get(String(values[2]));
      if (group) {
        group.active = Number(values[0]);
        changes = 1;
      }
    } else if (query.includes("AND EXISTS (SELECT 1 FROM groups")) {
      const group = this.groups.get(String(values[1]));
      if (group?.password_hash === values[2]) {
        const previousLength = this.sessions.size;
        for (const [token, session] of this.sessions) {
          if (session.role === "group" && session.subject === values[0]) {
            this.sessions.delete(token);
          }
        }
        changes = previousLength - this.sessions.size;
      }
    } else if (query.startsWith("DELETE FROM sessions WHERE role")) {
      const previousLength = this.sessions.size;
      for (const [token, session] of this.sessions) {
        if (session.role === "group" && session.subject === values[0]) {
          this.sessions.delete(token);
        }
      }
      changes = previousLength - this.sessions.size;
    }
    return { meta: { changes } };
  }
}

function makeEnvironment() {
  const put = vi.fn(
    async (
      key: string,
      file: Blob,
      options: { httpMetadata: { contentType: string } },
    ) => {
      storedFiles.set(key, {
        body: file.stream(),
        size: file.size,
        uploaded: new Date(),
        httpMetadata: options.httpMetadata,
      });
    },
  );
  const storedFiles = new Map<
    string,
    {
      body: ReadableStream<Uint8Array>;
      size: number;
      uploaded: Date;
      httpMetadata: { contentType: string };
    }
  >();
  const db = new MemoryDatabase();
  const environment = {
    ASSETS: { fetch: vi.fn(async () => new Response("asset")) },
    DB: db,
    ADMIN_PASSWORD: "a-long-admin-password-for-tests",
    SUBMISSIONS: {
      put,
      get: vi.fn(async (key: string) => storedFiles.get(key) ?? null),
      list: vi.fn(async ({ prefix }: { prefix: string }) => ({
        objects: [...storedFiles.entries()]
          .filter(([key]) => key.startsWith(prefix))
          .map(([key, file]) => ({
            key,
            size: file.size,
            uploaded: file.uploaded,
          })),
      })),
    },
  };
  return { environment, db, put, storedFiles };
}

function makeRequest(
  path: string,
  options: {
    method?: string;
    body?: BodyInit;
    cookie?: string;
    origin?: string | null;
  } = {},
) {
  const headers = new Headers();
  if (options.cookie) headers.set("Cookie", options.cookie);
  if (options.origin !== null) {
    headers.set("Origin", options.origin ?? "https://lc3.lgrum.xyz");
  }
  return new Request(`https://lc3.lgrum.xyz${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body,
  });
}

function getCookie(response: Response): string {
  const cookie = response.headers.get("set-cookie");
  expect(cookie).toBeTruthy();
  if (!cookie) throw new Error("The response did not set a session cookie.");
  return cookie.split(";")[0];
}

async function loginGroup(
  environment: ReturnType<typeof makeEnvironment>["environment"],
) {
  const response = await worker.fetch(
    makeRequest("/api/auth/group-login", {
      method: "POST",
      body: JSON.stringify({ group: "1", password: GROUP_PASSWORD }),
    }),
    environment,
  );
  return { response, cookie: getCookie(response) };
}

async function loginAdmin(
  environment: ReturnType<typeof makeEnvironment>["environment"],
) {
  const response = await worker.fetch(
    makeRequest("/api/auth/admin-login", {
      method: "POST",
      body: JSON.stringify({ password: "a-long-admin-password-for-tests" }),
    }),
    environment,
  );
  return { response, cookie: getCookie(response) };
}

beforeAll(async () => {
  groupPasswordHash = await hashPassword(GROUP_PASSWORD);
});

describe("account and submission worker", () => {
  it("authenticates a group and stores only under its session-owned key", async () => {
    const { environment, put } = makeEnvironment();
    const { response: loginResponse, cookie } = await loginGroup(environment);
    expect(loginResponse.status).toBe(200);
    expect(loginResponse.headers.get("set-cookie")).toContain(
      "HttpOnly; SameSite=Strict; Max-Age=28800; Secure",
    );

    const form = new FormData();
    form.set("group", "30");
    form.set("file", new File([".ORIG x3000\nHALT\n.END"], "work.asm"));
    const response = await worker.fetch(
      makeRequest("/api/submissions", {
        method: "POST",
        body: form,
        cookie,
      }),
      environment,
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ filename: "grupo1.asm" });
    expect(put).toHaveBeenCalledWith(
      "grupo1.asm",
      expect.any(File),
      expect.objectContaining({
        httpMetadata: { contentType: "text/plain; charset=utf-8" },
      }),
    );
    expect(environment.SUBMISSIONS.get).not.toHaveBeenCalled();
  });

  it("rejects uploads and administrative reads without a matching role", async () => {
    const { environment, put } = makeEnvironment();
    const form = new FormData();
    form.set("file", new File(["HALT"], "work.asm"));
    const upload = await worker.fetch(
      makeRequest("/api/submissions", { method: "POST", body: form }),
      environment,
    );
    const adminList = await worker.fetch(
      makeRequest("/api/admin/groups"),
      environment,
    );
    expect(upload.status).toBe(401);
    expect(adminList.status).toBe(401);
    expect(put).not.toHaveBeenCalled();
  });

  it("lets a signed-in group download only its own submission", async () => {
    const { environment, storedFiles } = makeEnvironment();
    const { cookie } = await loginGroup(environment);
    storedFiles.set("grupo1.asm", {
      body: new Blob(["GROUP ONE"]).stream(),
      size: 9,
      uploaded: new Date(),
      httpMetadata: { contentType: "text/plain" },
    });
    storedFiles.set("grupo30.asm", {
      body: new Blob(["GROUP THIRTY"]).stream(),
      size: 12,
      uploaded: new Date(),
      httpMetadata: { contentType: "text/plain" },
    });

    const response = await worker.fetch(
      makeRequest("/api/group/submission?group=30", { cookie }),
      environment,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="grupo1.asm"',
    );
    await expect(response.text()).resolves.toBe("GROUP ONE");
    expect(environment.SUBMISSIONS.get).toHaveBeenCalledTimes(1);
    expect(environment.SUBMISSIONS.get).toHaveBeenCalledWith("grupo1.asm");

    const noFile = await worker.fetch(
      makeRequest("/api/group/submission"),
      environment,
    );
    expect(noFile.status).toBe(401);
  });

  it("allows groups to change their password and revokes the old session", async () => {
    const { environment, db } = makeEnvironment();
    const { cookie } = await loginGroup(environment);
    const newPassword = "new-group-password-2026";
    const response = await worker.fetch(
      makeRequest("/api/group/password", {
        method: "POST",
        cookie,
        body: JSON.stringify({
          currentPassword: GROUP_PASSWORD,
          newPassword,
        }),
      }),
      environment,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    await expect(response.json()).resolves.toEqual({ changed: true });
    expect(db.sessions.size).toBe(0);

    const oldPasswordLogin = await worker.fetch(
      makeRequest("/api/auth/group-login", {
        method: "POST",
        body: JSON.stringify({ group: "1", password: GROUP_PASSWORD }),
      }),
      environment,
    );
    expect(oldPasswordLogin.status).toBe(401);
    const newPasswordLogin = await worker.fetch(
      makeRequest("/api/auth/group-login", {
        method: "POST",
        body: JSON.stringify({ group: "1", password: newPassword }),
      }),
      environment,
    );
    expect(newPasswordLogin.status).toBe(200);
  });

  it("requires the current password and a minimum-length replacement", async () => {
    const { environment } = makeEnvironment();
    const { cookie } = await loginGroup(environment);
    const incorrectCurrentPassword = await worker.fetch(
      makeRequest("/api/group/password", {
        method: "POST",
        cookie,
        body: JSON.stringify({
          currentPassword: "incorrect",
          newPassword: "new-group-password-2026",
        }),
      }),
      environment,
    );
    expect(incorrectCurrentPassword.status).toBe(401);

    const shortPassword = await worker.fetch(
      makeRequest("/api/group/password", {
        method: "POST",
        cookie,
        body: JSON.stringify({
          currentPassword: GROUP_PASSWORD,
          newPassword: "short",
        }),
      }),
      environment,
    );
    expect(shortPassword.status).toBe(400);
    await expect(shortPassword.json()).resolves.toEqual({
      error: "password_too_short",
    });
  });

  it("expires sessions and revokes them on logout", async () => {
    const { environment, db } = makeEnvironment();
    const expiredToken = "expired-session-token";
    db.sessions.set(await hashToken(expiredToken), {
      token_hash: await hashToken(expiredToken),
      role: "admin",
      subject: "admin",
      expires_at: Math.floor(Date.now() / 1000) - 1,
    });
    const expired = await worker.fetch(
      makeRequest("/api/admin/groups", {
        cookie: `lc3_session=${expiredToken}`,
      }),
      environment,
    );
    expect(expired.status).toBe(401);

    const { cookie } = await loginAdmin(environment);
    const logout = await worker.fetch(
      makeRequest("/api/auth/logout", { method: "POST", cookie }),
      environment,
    );
    expect(logout.status).toBe(200);
    expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");
    const afterLogout = await worker.fetch(
      makeRequest("/api/admin/groups", { cookie }),
      environment,
    );
    expect(afterLogout.status).toBe(401);
  });

  it("limits group access to its own session and does not expose admin files", async () => {
    const { environment, storedFiles } = makeEnvironment();
    const { cookie } = await loginGroup(environment);
    storedFiles.set("grupo30.asm", {
      body: new Blob(["secret"]).stream(),
      size: 6,
      uploaded: new Date(),
      httpMetadata: { contentType: "text/plain" },
    });

    const response = await worker.fetch(
      makeRequest("/api/admin/groups/30/submission", { cookie }),
      environment,
    );
    expect(response.status).toBe(401);
    expect(environment.SUBMISSIONS.get).not.toHaveBeenCalled();
  });

  it("lets administrators list groups, generate one-time passwords, and download files", async () => {
    const { environment, db, storedFiles } = makeEnvironment();
    const { response: loginResponse, cookie } = await loginAdmin(environment);
    expect(loginResponse.status).toBe(200);

    const list = await worker.fetch(
      makeRequest("/api/admin/groups", { cookie }),
      environment,
    );
    expect(list.status).toBe(200);
    const result = (await list.json()) as {
      groups: Array<{ group: string; passwordConfigured: boolean }>;
    };
    expect(result.groups).toHaveLength(21);
    expect(
      result.groups.find((group) => group.group === "1")?.passwordConfigured,
    ).toBe(true);

    const oldGroupSession = await loginGroup(environment);
    const passwordResponse = await worker.fetch(
      makeRequest("/api/admin/groups/1/password", {
        method: "POST",
        cookie,
      }),
      environment,
    );
    expect(passwordResponse.status).toBe(200);
    const data = (await passwordResponse.json()) as { password: string };
    expect(data.password).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(db.groups.get("1")?.password_hash).toMatch(
      /^pbkdf2-sha256\$600000\$/,
    );
    expect(db.groups.get("1")?.password_hash).not.toContain(data.password);
    expect(
      db.sessions.has(await hashToken(oldGroupSession.cookie.split("=")[1])),
    ).toBe(false);
    const oldPasswordLogin = await worker.fetch(
      makeRequest("/api/auth/group-login", {
        method: "POST",
        body: JSON.stringify({ group: "1", password: GROUP_PASSWORD }),
      }),
      environment,
    );
    expect(oldPasswordLogin.status).toBe(401);
    const newPasswordLogin = await worker.fetch(
      makeRequest("/api/auth/group-login", {
        method: "POST",
        body: JSON.stringify({ group: "1", password: data.password }),
      }),
      environment,
    );
    expect(newPasswordLogin.status).toBe(200);

    storedFiles.set("grupo1.asm", {
      body: new Blob(["HALT"]).stream(),
      size: 4,
      uploaded: new Date(),
      httpMetadata: { contentType: "text/plain; charset=utf-8" },
    });
    const download = await worker.fetch(
      makeRequest("/api/admin/groups/1/submission", { cookie }),
      environment,
    );
    expect(download.status).toBe(200);
    expect(download.headers.get("content-disposition")).toBe(
      'attachment; filename="grupo1.asm"',
    );
    await expect(download.text()).resolves.toBe("HALT");
  });

  it("deactivates a group without deleting its file and revokes its session", async () => {
    const { environment, db, storedFiles, put } = makeEnvironment();
    const { cookie: adminCookie } = await loginAdmin(environment);
    const { cookie: groupCookie } = await loginGroup(environment);
    storedFiles.set("grupo1.asm", {
      body: new Blob(["HALT"]).stream(),
      size: 4,
      uploaded: new Date(),
      httpMetadata: { contentType: "text/plain" },
    });

    const response = await worker.fetch(
      makeRequest("/api/admin/groups/1/active", {
        method: "POST",
        body: JSON.stringify({ active: false }),
        cookie: adminCookie,
      }),
      environment,
    );
    expect(response.status).toBe(200);
    expect(storedFiles.has("grupo1.asm")).toBe(true);
    expect(db.sessions.size).toBe(1);

    const form = new FormData();
    form.set("file", new File(["HALT"], "work.asm"));
    const upload = await worker.fetch(
      makeRequest("/api/submissions", {
        method: "POST",
        body: form,
        cookie: groupCookie,
      }),
      environment,
    );
    expect(upload.status).toBe(401);
    expect(put).not.toHaveBeenCalled();
  });

  it("rejects cross-origin mutations and rate-limits failed logins", async () => {
    const { environment } = makeEnvironment();
    const crossOrigin = await worker.fetch(
      makeRequest("/api/auth/admin-login", {
        method: "POST",
        body: JSON.stringify({ password: "wrong" }),
        origin: "https://attacker.example",
      }),
      environment,
    );
    expect(crossOrigin.status).toBe(403);

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await worker.fetch(
        makeRequest("/api/auth/admin-login", {
          method: "POST",
          body: JSON.stringify({ password: "wrong" }),
        }),
        environment,
      );
    }
    const limited = await worker.fetch(
      makeRequest("/api/auth/admin-login", {
        method: "POST",
        body: JSON.stringify({ password: "a-long-admin-password-for-tests" }),
      }),
      environment,
    );
    expect(limited.status).toBe(429);
  });

  it("rejects invalid submission file types", async () => {
    const { environment, put } = makeEnvironment();
    const { cookie } = await loginGroup(environment);
    const form = new FormData();
    form.set("file", new File(["text"], "program.txt"));
    const response = await worker.fetch(
      makeRequest("/api/submissions", {
        method: "POST",
        body: form,
        cookie,
      }),
      environment,
    );
    expect(response.status).toBe(400);
    expect(put).not.toHaveBeenCalled();
  });
});
