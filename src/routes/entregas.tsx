import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  DownloadIcon,
  KeyRoundIcon,
  LogOutIcon,
  ShieldIcon,
  UploadIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/entregas")({
  component: SubmissionsPage,
});

type Feedback = { kind: "success" | "error"; message: string } | null;

interface GroupSession {
  role: string;
  group: string | null;
}

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
      return m.group_password_invalid();
    case "invalid_credentials":
      return m.upload_error_password();
    case "password_too_short":
      return m.group_password_too_short();
    case "rate_limited":
      return m.admin_error_rate_limit();
    case "file_too_large":
      return m.upload_error_size();
    case "file_not_found":
      return m.group_submission_missing();
    case "invalid_file":
      return m.upload_error_file();
    case "not_configured":
      return m.upload_error_unavailable();
    default:
      return m.upload_error_generic();
  }
}

function SubmissionsPage() {
  const [group, setGroup] = useState("1");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmedPassword, setConfirmedPassword] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [authenticatedGroup, setAuthenticatedGroup] = useState<string | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  useEffect(() => {
    void fetch("/api/auth/session")
      .then(async (response) => {
        if (!response.ok) return;
        const session = (await response.json()) as GroupSession;
        if (session.role === "group" && session.group) {
          setGroup(session.group);
          setAuthenticatedGroup(session.group);
        }
      })
      .catch(() => {
        setFeedback({ kind: "error", message: m.upload_error_generic() });
      });
  }, []);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    setBusy(true);
    try {
      const response = await fetch("/api/auth/group-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group, password }),
      });
      const payload = (await response.json()) as {
        error?: string;
        group?: string;
      };
      if (!response.ok || !payload.group) {
        setFeedback({
          kind: "error",
          message: getErrorMessage(payload.error),
        });
        return;
      }
      setAuthenticatedGroup(payload.group);
      setGroup(payload.group);
      setPassword("");
    } catch {
      setFeedback({ kind: "error", message: m.upload_error_generic() });
    } finally {
      setBusy(false);
    }
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setFeedback(null);
    if (!file) {
      setFeedback({ kind: "error", message: m.upload_error_file() });
      return;
    }

    setBusy(true);
    try {
      const formData = new FormData();
      formData.set("file", file, file.name);
      const response = await fetch("/api/submissions", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as {
        error?: string;
        filename?: string;
      };
      if (!response.ok || !payload.filename) {
        setFeedback({
          kind: "error",
          message: getErrorMessage(payload.error),
        });
        return;
      }
      setFeedback({
        kind: "success",
        message: m.upload_success({ filename: payload.filename }),
      });
      setFile(null);
      form.reset();
    } catch {
      setFeedback({ kind: "error", message: m.upload_error_generic() });
    } finally {
      setBusy(false);
    }
  }

  async function handlePasswordChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    if (newPassword !== confirmedPassword) {
      setFeedback({
        kind: "error",
        message: m.group_password_mismatch(),
      });
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/group/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: password, newPassword }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setFeedback({
          kind: "error",
          message: getErrorMessage(payload.error),
        });
        return;
      }
      setAuthenticatedGroup(null);
      setPassword("");
      setNewPassword("");
      setConfirmedPassword("");
      setFeedback({
        kind: "success",
        message: m.group_password_changed(),
      });
    } catch {
      setFeedback({ kind: "error", message: m.upload_error_generic() });
    } finally {
      setBusy(false);
    }
  }

  async function handleDownload() {
    setFeedback(null);
    setBusy(true);
    try {
      const response = await fetch("/api/group/submission");
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setFeedback({
          kind: "error",
          message: getErrorMessage(payload.error),
        });
        return;
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `grupo${authenticatedGroup}.asm`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch {
      setFeedback({ kind: "error", message: m.upload_error_generic() });
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setAuthenticatedGroup(null);
      setPassword("");
      setNewPassword("");
      setConfirmedPassword("");
      setFile(null);
      setFeedback(null);
    } catch {
      setFeedback({ kind: "error", message: m.upload_error_generic() });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-linear-to-b from-case-top to-case-bottom p-4 text-silk">
      <section className="w-full max-w-lg rounded-2xl border border-seam bg-case-2 p-6 shadow-lg sm:p-8">
        <div className="mb-8 flex items-center justify-between gap-4">
          <Link
            className="inline-flex items-center gap-2 text-sm text-silk-2 hover:text-silk-hi"
            to="/"
          >
            <ArrowLeftIcon aria-hidden className="size-4" />
            {m.upload_return()}
          </Link>
          <Link
            className="inline-flex items-center gap-2 text-sm text-silk-2 hover:text-silk-hi"
            to="/admin"
          >
            <ShieldIcon aria-hidden className="size-4" />
            {m.admin_title()}
          </Link>
        </div>

        <div className="mb-7 flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
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
          {authenticatedGroup && (
            <Button
              aria-label={m.group_logout()}
              disabled={busy}
              onClick={handleLogout}
              size="icon"
              variant="outline"
            >
              <LogOutIcon aria-hidden />
            </Button>
          )}
        </div>

        {authenticatedGroup ? (
          <div className="space-y-6">
            <section className="space-y-4">
              <h2 className="text-lg font-semibold text-silk-hi">
                {m.group_signed_in({ group: authenticatedGroup })}
              </h2>
              <form className="space-y-4" onSubmit={handleUpload}>
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
                <Button className="w-full" loading={busy} type="submit">
                  <UploadIcon aria-hidden />
                  {m.upload_submit()}
                </Button>
              </form>
              <Button
                className="w-full"
                disabled={busy}
                onClick={handleDownload}
                variant="outline"
              >
                <DownloadIcon aria-hidden />
                {m.group_download_submission()}
              </Button>
            </section>

            <form
              className="space-y-4 border-t border-seam pt-5"
              onSubmit={handlePasswordChange}
            >
              <h2 className="flex items-center gap-2 text-lg font-semibold text-silk-hi">
                <KeyRoundIcon aria-hidden className="size-4" />
                {m.group_change_password()}
              </h2>
              <label className="block space-y-2 text-sm font-medium">
                <span>{m.group_current_password()}</span>
                <Input
                  autoComplete="current-password"
                  onChange={(event) => setPassword(event.currentTarget.value)}
                  required
                  type="password"
                  value={password}
                />
              </label>
              <label className="block space-y-2 text-sm font-medium">
                <span>{m.group_new_password()}</span>
                <Input
                  autoComplete="new-password"
                  minLength={12}
                  onChange={(event) =>
                    setNewPassword(event.currentTarget.value)
                  }
                  required
                  type="password"
                  value={newPassword}
                />
                <span className="block text-xs font-normal text-silk-2">
                  {m.group_password_hint()}
                </span>
              </label>
              <label className="block space-y-2 text-sm font-medium">
                <span>{m.group_confirm_password()}</span>
                <Input
                  autoComplete="new-password"
                  minLength={12}
                  onChange={(event) =>
                    setConfirmedPassword(event.currentTarget.value)
                  }
                  required
                  type="password"
                  value={confirmedPassword}
                />
              </label>
              <Button className="w-full" loading={busy} type="submit">
                {m.group_update_password()}
              </Button>
            </form>
          </div>
        ) : (
          <form className="space-y-5" onSubmit={handleLogin}>
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
            <Button className="w-full" loading={busy} type="submit">
              {m.group_sign_in()}
            </Button>
          </form>
        )}

        {feedback && (
          <p
            className={`mt-5 rounded-lg border p-3 text-sm ${
              feedback.kind === "success"
                ? "border-success/24 bg-success/8 text-success"
                : "border-destructive/24 bg-destructive/8 text-destructive-foreground"
            }`}
            role={feedback.kind === "success" ? "status" : "alert"}
          >
            {feedback.kind === "success" && (
              <CheckCircle2Icon
                aria-hidden
                className="mr-2 inline size-4 align-text-bottom"
              />
            )}
            {feedback.message}
          </p>
        )}

        <p className="mt-5 border-t border-seam pt-4 text-xs leading-relaxed text-silk-2">
          {m.upload_overwrite()}
        </p>
      </section>
    </main>
  );
}
