interface WorkerEnvironment {
  ASSETS: {
    fetch: (request: Request) => Promise<Response>;
  };
  GROUP_PASSWORDS: string;
  SUBMISSIONS: {
    put: (
      key: string,
      value: Blob,
      options: { httpMetadata: { contentType: string } },
    ) => Promise<unknown>;
  };
}

const MAX_FILE_SIZE = 1024 * 1024;
const MAX_REQUEST_SIZE = MAX_FILE_SIZE + 64 * 1024;
const GROUP_NUMBERS = [
  1, 3, 4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 18, 19, 20, 21, 22, 23, 24, 27, 30,
];

function jsonResponse(body: Record<string, string>, status: number): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function validGroup(value: FormDataEntryValue | null): value is string {
  return (
    typeof value === "string" &&
    GROUP_NUMBERS.some((group) => String(group) === value)
  );
}

function isPasswordMap(value: unknown): value is Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const passwords = value as Record<string, unknown>;
  return GROUP_NUMBERS.every(
    (group) =>
      typeof passwords[group] === "string" && passwords[group].length > 0,
  );
}

async function submit(
  request: Request,
  environment: WorkerEnvironment,
): Promise<Response> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_REQUEST_SIZE) {
    return jsonResponse({ error: "file_too_large" }, 413);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonResponse({ error: "invalid_file" }, 400);
  }

  const group = form.get("group");
  const password = form.get("password");
  const file = form.get("file");

  if (!validGroup(group)) {
    return jsonResponse({ error: "invalid_group" }, 400);
  }
  if (typeof password !== "string" || password.length === 0) {
    return jsonResponse({ error: "invalid_password" }, 401);
  }
  if (!(file instanceof File)) {
    return jsonResponse({ error: "invalid_file" }, 400);
  }
  if (file.size > MAX_FILE_SIZE) {
    return jsonResponse({ error: "file_too_large" }, 413);
  }
  if (file.size === 0 || !file.name.toLowerCase().endsWith(".asm")) {
    return jsonResponse({ error: "invalid_file" }, 400);
  }

  let passwordMap: unknown;
  try {
    passwordMap = JSON.parse(environment.GROUP_PASSWORDS);
  } catch (error) {
    console.error("GROUP_PASSWORDS is not valid JSON.", error);
    return jsonResponse({ error: "not_configured" }, 503);
  }

  if (!isPasswordMap(passwordMap)) {
    console.error(
      "GROUP_PASSWORDS must contain a password for every active group.",
    );
    return jsonResponse({ error: "not_configured" }, 503);
  }
  if (passwordMap[group] !== password) {
    return jsonResponse({ error: "invalid_password" }, 401);
  }

  const filename = `grupo${group}.asm`;
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

export default {
  async fetch(
    request: Request,
    environment: WorkerEnvironment,
  ): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/submissions") {
      if (request.method !== "POST") {
        return jsonResponse({ error: "method_not_allowed" }, 405);
      }
      return submit(request, environment);
    }

    return environment.ASSETS.fetch(request);
  },
};
