import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeftIcon, CheckCircle2Icon, UploadIcon } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/entregas")({
  component: SubmissionsPage,
});

type SubmissionResult =
  | { kind: "success"; filename: string }
  | { kind: "error"; message: string }
  | null;

const GROUPS = [
  "1",
  "3",
  "4",
  "5",
  "6",
  "7",
  "9",
  "10",
  "11",
  "12",
  "14",
  "15",
  "18",
  "19",
  "20",
  "21",
  "22",
  "23",
  "24",
  "27",
  "30",
];

function getErrorMessage(error: string | undefined) {
  switch (error) {
    case "invalid_group":
      return m.upload_error_group();
    case "invalid_password":
      return m.upload_error_password();
    case "invalid_file":
      return m.upload_error_file();
    case "file_too_large":
      return m.upload_error_size();
    case "not_configured":
      return m.upload_error_unavailable();
    default:
      return m.upload_error_generic();
  }
}

function SubmissionsPage() {
  const [group, setGroup] = useState("1");
  const [password, setPassword] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmissionResult>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setResult(null);

    if (!file) {
      setResult({ kind: "error", message: m.upload_error_file() });
      return;
    }

    const formData = new FormData();
    formData.set("group", group);
    formData.set("password", password);
    formData.set("file", file, file.name);

    setSubmitting(true);
    try {
      const response = await fetch("/api/submissions", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as {
        error?: string;
        filename?: string;
      };

      if (!response.ok || !payload.filename) {
        setResult({
          kind: "error",
          message: getErrorMessage(payload.error),
        });
        return;
      }

      setResult({ kind: "success", filename: payload.filename });
      setPassword("");
      setFile(null);
      form.reset();
    } catch {
      setResult({ kind: "error", message: m.upload_error_generic() });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-linear-to-b from-case-top to-case-bottom p-4 text-silk">
      <section className="w-full max-w-lg rounded-2xl border border-seam bg-case-2 p-6 shadow-lg sm:p-8">
        <Link
          className="mb-8 inline-flex items-center gap-2 text-sm text-silk-2 hover:text-silk-hi"
          to="/"
        >
          <ArrowLeftIcon aria-hidden className="size-4" />
          {m.upload_return()}
        </Link>

        <div className="mb-7 flex items-start gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-edge bg-background text-phosphor">
            <UploadIcon aria-hidden className="size-5" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold text-silk-hi">
              {m.upload_title()}
            </h1>
            <p className="mt-1 text-sm leading-relaxed text-silk-2">
              {m.upload_description()}
            </p>
          </div>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <label className="block space-y-2 text-sm font-medium">
            <span>{m.upload_group_label()}</span>
            <select
              className="h-10 w-full rounded-lg border border-input bg-background px-3 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onChange={(event) => setGroup(event.currentTarget.value)}
              required
              value={group}
            >
              {GROUPS.map((number) => (
                <option key={number} value={number}>
                  {number}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-2 text-sm font-medium">
            <span>{m.upload_password_label()}</span>
            <Input
              autoComplete="current-password"
              onChange={(event) => setPassword(event.currentTarget.value)}
              required
              type="password"
              value={password}
            />
          </label>

          <label className="block space-y-2 text-sm font-medium">
            <span>{m.upload_file_label()}</span>
            <Input
              accept=".asm"
              nativeInput
              onChange={(event) =>
                setFile(event.currentTarget.files?.[0] ?? null)
              }
              required
              type="file"
            />
            <span className="block text-xs font-normal text-silk-2">
              {m.upload_file_hint()}
            </span>
          </label>

          {result?.kind === "success" && (
            <p
              className="flex items-center gap-2 rounded-lg border border-success/24 bg-success/8 p-3 text-sm text-success"
              role="status"
            >
              <CheckCircle2Icon aria-hidden className="size-4 shrink-0" />
              {m.upload_success({ filename: result.filename })}
            </p>
          )}
          {result?.kind === "error" && (
            <p
              className="rounded-lg border border-destructive/24 bg-destructive/8 p-3 text-sm text-destructive-foreground"
              role="alert"
            >
              {result.message}
            </p>
          )}

          <Button className="w-full" loading={submitting} type="submit">
            <UploadIcon aria-hidden />
            {m.upload_submit()}
          </Button>
        </form>

        <p className="mt-5 border-t border-seam pt-4 text-xs leading-relaxed text-silk-2">
          {m.upload_overwrite()}
        </p>
      </section>
    </main>
  );
}
