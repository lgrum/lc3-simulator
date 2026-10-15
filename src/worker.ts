interface DatabaseResult {
  meta?: { changes?: number };
}

interface DatabaseStatement {
  bind: (...values: Array<string | number | null>) => DatabaseStatement;
  first: <T>() => Promise<T | null>;
  run: () => Promise<DatabaseResult>;
  all: <T>() => Promise<{ results: Array<T> }>;
}

interface Database {
  prepare: (query: string) => DatabaseStatement;
  batch: (
    statements: Array<DatabaseStatement>,
  ) => Promise<Array<DatabaseResult>>;
}

interface StoredObject {
  body: ReadableStream<Uint8Array>;
  size: number;
  uploaded: Date;
  httpMetadata?: { contentType?: string };
}

interface ObjectBucket {
  put: (
    key: string,
    value: Blob,
    options: { httpMetadata: { contentType: string } },
  ) => Promise<unknown>;
  get: (key: string) => Promise<StoredObject | null>;
  list: (options: { prefix: string }) => Promise<{
    objects: Array<{ key: string; size: number; uploaded: Date }>;
  }>;
}

interface WorkerEnvironment {
  ASSETS: {
    fetch: (request: Request) => Promise<Response>;
  };
  DB?: Database;
  SUBMISSIONS: ObjectBucket;
  ADMIN_PASSWORD?: string;
}

interface Session {
  role: "group" | "admin";
  subject: string;
}

interface GroupRecord {
  group_id: string;
  active: number;
  password_hash: string | null;
}

interface StoredSession extends Session {
  expires_at: number;
}

interface AdminGroupRecord {
  group_id: string;
  active: number;
  password_configured: number;
}

const MAX_FILE_SIZE = 1024 * 1024;
const MAX_REQUEST_SIZE = MAX_FILE_SIZE + 64 * 1024;
const SESSION_DURATION_SECONDS = 8 * 60 * 60;
const LOGIN_WINDOW_SECONDS = 15 * 60;
const MAX_LOGIN_ATTEMPTS = 10;
const PBKDF2_ITERATIONS = 600_000;
const COOKIE_NAME = "lc3_session";
const GROUP_NUMBERS = [
  1, 3, 4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 18, 19, 20, 21, 22, 23, 24, 27, 30,
];
const GROUP_IDS = new Set(GROUP_NUMBERS.map(String));

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function database(environment: WorkerEnvironment): Database {
  if (!environment.DB) {
    throw new Error("The D1 database binding is not configured.");
  }
  return environment.DB;
}

function groupId(value: string | undefined): string | null {
  return value && GROUP_IDS.has(value) ? value : null;
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function decodeBase64(value: string): Uint8Array {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(
    normalized + "=".repeat((4 - (normalized.length % 4)) % 4),
  );
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return encodeBase64(new Uint8Array(bytes));
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
  const result = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS },
    key,
    256,
  );
  return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${encodeBase64(salt)}$${encodeBase64(new Uint8Array(result))}`;
}

async function verifyPassword(
  password: string,
  encodedHash: string,
): Promise<boolean> {
  const [algorithm, iterationsValue, saltValue, hashValue] =
    encodedHash.split("$");
  const iterations = Number(iterationsValue);
  if (
    algorithm !== "pbkdf2-sha256" ||
    !Number.isInteger(iterations) ||
    iterations < 100_000 ||
    iterations > 1_000_000 ||
    !saltValue ||
    !hashValue ||
    saltValue.length !== 22 ||
    hashValue.length !== 43 ||
    !/^[A-Za-z0-9_-]+$/.test(saltValue) ||
    !/^[A-Za-z0-9_-]+$/.test(hashValue)
  ) {
    return false;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const result = new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        salt: Uint8Array.from(decodeBase64(saltValue)),
        iterations,
      },
      key,
      256,
    ),
  );
  const expected = decodeBase64(hashValue);
  return (
    result.length === expected.length &&
    secureCompare(encodeBase64(result), encodeBase64(expected))
  );
}

function secureCompare(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  let difference = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

function randomToken(byteLength: number): string {
  return encodeBase64(crypto.getRandomValues(new Uint8Array(byteLength)));
}

function sessionCookie(token: string, request: Request): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_DURATION_SECONDS}${secure}`;
}

function clearedSessionCookie(request: Request): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}

function cookieToken(request: Request): string | null {
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;
  for (const part of cookie.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === COOKIE_NAME) return value.join("=") || null;
  }
  return null;
}

async function getSession(
  request: Request,
  environment: WorkerEnvironment,
): Promise<{ tokenHash: string; session: StoredSession } | null> {
  const token = cookieToken(request);
  if (!token) return null;
  const tokenHash = await digest(token);
  const session = await database(environment)
    .prepare(
      "SELECT role, subject, expires_at FROM sessions WHERE token_hash = ? AND expires_at > ?",
    )
    .bind(tokenHash, Math.floor(Date.now() / 1000))
    .first<StoredSession>();
  return session ? { tokenHash, session } : null;
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return origin === new URL(request.url).origin;
}

function clientAddress(request: Request): string {
  return request.headers.get("cf-connecting-ip") ?? "unknown";
}

function exceedsRequestLimit(request: Request, limit: number): boolean {
  const contentLength = request.headers.get("content-length");
  return (
    contentLength !== null &&
    (!/^\d+$/.test(contentLength) || Number(contentLength) > limit)
  );
}

async function isRateLimited(
  request: Request,
  environment: WorkerEnvironment,
): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const row = await database(environment)
    .prepare(
      "SELECT COUNT(*) AS count FROM login_attempts WHERE address = ? AND attempted_at > ?",
    )
    .bind(clientAddress(request), now - LOGIN_WINDOW_SECONDS)
    .first<{ count: number }>();
  return (row?.count ?? 0) >= MAX_LOGIN_ATTEMPTS;
}

async function recordFailedLogin(
  request: Request,
  environment: WorkerEnvironment,
): Promise<void> {
  const db = database(environment);
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare("INSERT INTO login_attempts (address, attempted_at) VALUES (?, ?)")
    .bind(clientAddress(request), now)
    .run();
  await db
    .prepare("DELETE FROM login_attempts WHERE attempted_at < ?")
    .bind(now - LOGIN_WINDOW_SECONDS)
    .run();
}

async function startSession(
  request: Request,
  environment: WorkerEnvironment,
  session: Session,
  verifiedGroupHash?: string,
): Promise<Response> {
  const token = randomToken(32);
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS;
  const db = database(environment);
  const tokenHash = await digest(token);
  const savedSession = verifiedGroupHash
    ? await db
        .prepare(
          "INSERT INTO sessions (token_hash, role, subject, expires_at) SELECT ?, 'group', group_id, ? FROM groups WHERE group_id = ? AND active = 1 AND password_hash = ?",
        )
        .bind(tokenHash, expiresAt, session.subject, verifiedGroupHash)
        .run()
    : await db
        .prepare(
          "INSERT INTO sessions (token_hash, role, subject, expires_at) VALUES (?, ?, ?, ?)",
        )
        .bind(tokenHash, session.role, session.subject, expiresAt)
        .run();
  if (!savedSession.meta?.changes) {
    return jsonResponse({ error: "invalid_credentials" }, 401);
  }
  return jsonResponseWithHeaders(
    {
      role: session.role,
      group: session.role === "group" ? session.subject : null,
    },
    200,
    { "Set-Cookie": sessionCookie(token, request) },
  );
}

function jsonResponseWithHeaders(
  body: Record<string, unknown>,
  status: number,
  headers: HeadersInit,
): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Cache-Control", "no-store");
  return Response.json(body, { status, headers: responseHeaders });
}

async function groupLogin(
  request: Request,
  environment: WorkerEnvironment,
): Promise<Response> {
  if (exceedsRequestLimit(request, 4096)) {
    return jsonResponse({ error: "invalid_request" }, 413);
  }
  if (await isRateLimited(request, environment)) {
    return jsonResponse({ error: "rate_limited" }, 429);
  }

  let body: { group?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "invalid_request" }, 400);
  }

  const id = typeof body.group === "string" ? groupId(body.group) : null;
  const password = typeof body.password === "string" ? body.password : "";
  if (!id || !password || password.length > 256) {
    await recordFailedLogin(request, environment);
    return jsonResponse({ error: "invalid_credentials" }, 401);
  }

  const group = await database(environment)
    .prepare(
      "SELECT group_id, active, password_hash FROM groups WHERE group_id = ?",
    )
    .bind(id)
    .first<GroupRecord>();
  if (
    !group ||
    group.active !== 1 ||
    !group.password_hash ||
    !(await verifyPassword(password, group.password_hash))
  ) {
    await recordFailedLogin(request, environment);
    return jsonResponse({ error: "invalid_credentials" }, 401);
  }

  return startSession(
    request,
    environment,
    { role: "group", subject: id },
    group.password_hash,
  );
}

async function adminLogin(
  request: Request,
  environment: WorkerEnvironment,
): Promise<Response> {
  if (!environment.ADMIN_PASSWORD || environment.ADMIN_PASSWORD.length < 16) {
    console.error("ADMIN_PASSWORD Worker secret is not configured.");
    return jsonResponse({ error: "not_configured" }, 503);
  }
  if (exceedsRequestLimit(request, 4096)) {
    return jsonResponse({ error: "invalid_request" }, 413);
  }
  if (await isRateLimited(request, environment)) {
    return jsonResponse({ error: "rate_limited" }, 429);
  }

  let body: { password?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "invalid_request" }, 400);
  }
  const password = typeof body.password === "string" ? body.password : "";
  if (!password || !secureCompare(password, environment.ADMIN_PASSWORD)) {
    await recordFailedLogin(request, environment);
    return jsonResponse({ error: "invalid_credentials" }, 401);
  }
  return startSession(request, environment, {
    role: "admin",
    subject: "admin",
  });
}

async function logout(
  request: Request,
  environment: WorkerEnvironment,
): Promise<Response> {
  const token = cookieToken(request);
  if (token) {
    await database(environment)
      .prepare("DELETE FROM sessions WHERE token_hash = ?")
      .bind(await digest(token))
      .run();
  }
  return jsonResponseWithHeaders({ ok: true }, 200, {
    "Set-Cookie": clearedSessionCookie(request),
  });
}

async function currentSession(
  request: Request,
  environment: WorkerEnvironment,
): Promise<Response> {
  const current = await getSession(request, environment);
  if (!current) return jsonResponse({ error: "unauthorized" }, 401);
  if (current.session.role === "group") {
    const group = await database(environment)
      .prepare("SELECT active FROM groups WHERE group_id = ?")
      .bind(current.session.subject)
      .first<{ active: number }>();
    if (!group || group.active !== 1) {
      return jsonResponse({ error: "unauthorized" }, 401);
    }
  }
  return jsonResponse({
    role: current.session.role,
    group: current.session.role === "group" ? current.session.subject : null,
  });
}

async function requireRole(
  request: Request,
  environment: WorkerEnvironment,
  role: Session["role"],
): Promise<{ tokenHash: string; session: StoredSession } | Response> {
  const current = await getSession(request, environment);
  if (!current || current.session.role !== role) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }
  if (role === "group") {
    const group = await database(environment)
      .prepare("SELECT active FROM groups WHERE group_id = ?")
      .bind(current.session.subject)
      .first<{ active: number }>();
    if (!group || group.active !== 1) {
      return jsonResponse({ error: "unauthorized" }, 401);
    }
  }
  return current;
}

function isResponse(value: unknown): value is Response {
  return value instanceof Response;
}

async function submit(
  request: Request,
  environment: WorkerEnvironment,
): Promise<Response> {
  if (!sameOrigin(request)) return jsonResponse({ error: "forbidden" }, 403);
  const current = await requireRole(request, environment, "group");
  if (isResponse(current)) return current;

  if (exceedsRequestLimit(request, MAX_REQUEST_SIZE)) {
    return jsonResponse({ error: "file_too_large" }, 413);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonResponse({ error: "invalid_file" }, 400);
  }
  const file = form.get("file");
  if (!(file instanceof File))
    return jsonResponse({ error: "invalid_file" }, 400);
  if (file.size > MAX_FILE_SIZE) {
    return jsonResponse({ error: "file_too_large" }, 413);
  }
  if (file.size === 0 || !file.name.toLowerCase().endsWith(".asm")) {
    return jsonResponse({ error: "invalid_file" }, 400);
  }

  const filename = `grupo${current.session.subject}.asm`;
  try {
    await environment.SUBMISSIONS.put(filename, file, {
      httpMetadata: { contentType: "text/plain; charset=utf-8" },
    });
  } catch (error) {
    console.error(`Failed to save ${filename} to R2.`, error);
    return jsonResponse({ error: "storage_error" }, 500);
  }
  return jsonResponse({ filename }, 201);
}

async function groupSubmission(
  request: Request,
  environment: WorkerEnvironment,
): Promise<Response> {
  const current = await requireRole(request, environment, "group");
  if (isResponse(current)) return current;

  const group = current.session.subject;
  const file = await environment.SUBMISSIONS.get(`grupo${group}.asm`);
  if (!file) return jsonResponse({ error: "file_not_found" }, 404);
  return new Response(file.body, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type":
        file.httpMetadata?.contentType ?? "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="grupo${group}.asm"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function changeGroupPassword(
  request: Request,
  environment: WorkerEnvironment,
): Promise<Response> {
  if (exceedsRequestLimit(request, 4096)) {
    return jsonResponse({ error: "invalid_request" }, 413);
  }

  const current = await requireRole(request, environment, "group");
  if (isResponse(current)) return current;
  if (await isRateLimited(request, environment)) {
    return jsonResponse({ error: "rate_limited" }, 429);
  }

  let body: { currentPassword?: unknown; newPassword?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "invalid_request" }, 400);
  }
  const currentPassword =
    typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword =
    typeof body.newPassword === "string" ? body.newPassword : "";
  if (!currentPassword || currentPassword.length > 256) {
    return jsonResponse({ error: "invalid_password" }, 400);
  }
  if (newPassword.length < 12 || newPassword.length > 128) {
    return jsonResponse({ error: "password_too_short" }, 400);
  }

  const db = database(environment);
  const group = await db
    .prepare(
      "SELECT password_hash FROM groups WHERE group_id = ? AND active = 1",
    )
    .bind(current.session.subject)
    .first<{ password_hash: string | null }>();
  if (
    !group?.password_hash ||
    !(await verifyPassword(currentPassword, group.password_hash))
  ) {
    await recordFailedLogin(request, environment);
    return jsonResponse({ error: "invalid_credentials" }, 401);
  }

  const newHash = await hashPassword(newPassword);
  const results = await db.batch([
    db
      .prepare(
        "UPDATE groups SET password_hash = ?, updated_at = ? WHERE group_id = ? AND password_hash = ? AND active = 1",
      )
      .bind(
        newHash,
        new Date().toISOString(),
        current.session.subject,
        group.password_hash,
      ),
    db
      .prepare(
        "DELETE FROM sessions WHERE role = 'group' AND subject = ? AND EXISTS (SELECT 1 FROM groups WHERE group_id = ? AND password_hash = ?)",
      )
      .bind(current.session.subject, current.session.subject, newHash),
  ]);
  if (!results[0]?.meta?.changes) {
    return jsonResponse({ error: "invalid_credentials" }, 409);
  }

  return jsonResponseWithHeaders({ changed: true }, 200, {
    "Set-Cookie": clearedSessionCookie(request),
  });
}

async function adminGroups(environment: WorkerEnvironment): Promise<Response> {
  const db = database(environment);
  const [result, listing] = await Promise.all([
    db
      .prepare(
        "SELECT group_id, active, password_hash IS NOT NULL AS password_configured FROM groups ORDER BY CAST(group_id AS INTEGER)",
      )
      .all<AdminGroupRecord>(),
    environment.SUBMISSIONS.list({ prefix: "grupo" }),
  ]);
  const objects = new Map(
    listing.objects.map((object) => [object.key, object]),
  );
  const groups = result.results.map((group) => {
    const file = objects.get(`grupo${group.group_id}.asm`);
    return {
      group_id: group.group_id,
      active: group.active,
      password_configured: group.password_configured,
      fileName: file?.key ?? null,
      fileSize: file?.size ?? null,
      uploadedAt: file?.uploaded.toISOString() ?? null,
    };
  });
  return jsonResponse({
    groups: groups.map((group) => ({
      group: group.group_id,
      active: group.active === 1,
      passwordConfigured: group.password_configured === 1,
      fileName: group.fileName,
      fileSize: group.fileSize,
      uploadedAt: group.uploadedAt,
    })),
  });
}

async function manageGroup(
  request: Request,
  environment: WorkerEnvironment,
  id: string,
  action: string,
): Promise<Response> {
  if (!groupId(id)) return jsonResponse({ error: "invalid_group" }, 400);
  const db = database(environment);
  const existing = await db
    .prepare("SELECT group_id FROM groups WHERE group_id = ?")
    .bind(id)
    .first<{ group_id: string }>();
  if (!existing) return jsonResponse({ error: "invalid_group" }, 404);

  if (action === "password" && request.method === "POST") {
    const password = randomToken(18);
    const passwordHash = await hashPassword(password);
    const results = await db.batch([
      db
        .prepare(
          "UPDATE groups SET password_hash = ?, updated_at = ? WHERE group_id = ?",
        )
        .bind(passwordHash, new Date().toISOString(), id),
      db
        .prepare("DELETE FROM sessions WHERE role = 'group' AND subject = ?")
        .bind(id),
    ]);
    if (!results[0]?.meta?.changes) {
      return jsonResponse({ error: "not_found" }, 404);
    }
    return jsonResponse({ group: id, password });
  }

  if (action === "active" && request.method === "POST") {
    let body: { active?: unknown };
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: "invalid_request" }, 400);
    }
    if (typeof body.active !== "boolean") {
      return jsonResponse({ error: "invalid_request" }, 400);
    }
    if (!body.active) {
      const results = await db.batch([
        db
          .prepare(
            "UPDATE groups SET active = ?, updated_at = ? WHERE group_id = ?",
          )
          .bind(0, new Date().toISOString(), id),
        db
          .prepare("DELETE FROM sessions WHERE role = 'group' AND subject = ?")
          .bind(id),
      ]);
      if (!results[0]?.meta?.changes) {
        return jsonResponse({ error: "not_found" }, 404);
      }
    } else {
      await db
        .prepare(
          "UPDATE groups SET active = ?, updated_at = ? WHERE group_id = ?",
        )
        .bind(1, new Date().toISOString(), id)
        .run();
    }
    return jsonResponse({ group: id, active: body.active });
  }

  if (action === "submission" && request.method === "GET") {
    const file = await environment.SUBMISSIONS.get(`grupo${id}.asm`);
    if (!file) return jsonResponse({ error: "file_not_found" }, 404);
    return new Response(file.body, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type":
          file.httpMetadata?.contentType ?? "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="grupo${id}.asm"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  return jsonResponse({ error: "method_not_allowed" }, 405);
}

async function handleApi(
  request: Request,
  environment: WorkerEnvironment,
): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (
    request.method === "POST" &&
    pathname.startsWith("/api/") &&
    !sameOrigin(request)
  ) {
    return jsonResponse({ error: "forbidden" }, 403);
  }
  if (pathname === "/api/auth/group-login" && request.method === "POST") {
    return groupLogin(request, environment);
  }
  if (pathname === "/api/auth/admin-login" && request.method === "POST") {
    return adminLogin(request, environment);
  }
  if (pathname === "/api/auth/logout" && request.method === "POST") {
    if (!sameOrigin(request)) return jsonResponse({ error: "forbidden" }, 403);
    return logout(request, environment);
  }
  if (pathname === "/api/auth/session" && request.method === "GET") {
    return currentSession(request, environment);
  }
  if (pathname === "/api/submissions" && request.method === "POST") {
    return submit(request, environment);
  }
  if (pathname === "/api/group/password" && request.method === "POST") {
    return changeGroupPassword(request, environment);
  }
  if (pathname === "/api/group/submission" && request.method === "GET") {
    return groupSubmission(request, environment);
  }
  if (pathname === "/api/admin/groups" && request.method === "GET") {
    if (isResponse(await requireRole(request, environment, "admin"))) {
      return jsonResponse({ error: "unauthorized" }, 401);
    }
    return adminGroups(environment);
  }

  const groupMatch =
    /^\/api\/admin\/groups\/([^/]+)\/(password|active|submission)$/.exec(
      pathname,
    );
  if (groupMatch) {
    if (!sameOrigin(request)) return jsonResponse({ error: "forbidden" }, 403);
    const authorization = await requireRole(request, environment, "admin");
    if (isResponse(authorization)) return authorization;
    return manageGroup(request, environment, groupMatch[1], groupMatch[2]);
  }
  if (pathname.startsWith("/api/"))
    return jsonResponse({ error: "not_found" }, 404);
  return environment.ASSETS.fetch(request);
}

export default {
  async fetch(
    request: Request,
    environment: WorkerEnvironment,
  ): Promise<Response> {
    try {
      return await handleApi(request, environment);
    } catch (error) {
      console.error("Request handling failed.", error);
      return jsonResponse({ error: "internal_error" }, 500);
    }
  },
};
