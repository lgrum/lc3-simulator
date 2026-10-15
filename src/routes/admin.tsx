import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeftIcon,
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  KeyRoundIcon,
  LogOutIcon,
  ShieldIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
});

interface GroupAccount {
  group: string;
  active: boolean;
  passwordConfigured: boolean;
  fileName: string | null;
  fileSize: number | null;
  uploadedAt: string | null;
}

function AdminPage() {
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [groups, setGroups] = useState<Array<GroupAccount>>([]);
  const [selectedGroup, setSelectedGroup] = useState("1");
  const [generatedPassword, setGeneratedPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadGroups() {
    const response = await fetch("/api/admin/groups");
    if (!response.ok) {
      throw new Error("admin_session_expired");
    }
    const data = (await response.json()) as { groups: Array<GroupAccount> };
    setGroups(data.groups);
  }

  useEffect(() => {
    void fetch("/api/auth/session")
      .then(async (response) => {
        if (!response.ok) return;
        const data = (await response.json()) as { role: string };
        if (data.role !== "admin") return;
        setAuthenticated(true);
        const groupsResponse = await fetch("/api/admin/groups");
        if (!groupsResponse.ok) {
          setAuthenticated(false);
          return;
        }
        const result = (await groupsResponse.json()) as {
          groups: Array<GroupAccount>;
        };
        setGroups(result.groups);
      })
      .catch(() => {
        setError(m.admin_error_generic());
      });
  }, []);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/auth/admin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        setError(
          data.error === "rate_limited"
            ? m.admin_error_rate_limit()
            : data.error === "not_configured"
              ? m.admin_error_unavailable()
              : data.error === "invalid_credentials"
                ? m.admin_error_credentials()
                : m.admin_error_generic(),
        );
        return;
      }
      setPassword("");
      await loadGroups();
      setAuthenticated(true);
    } catch {
      setError(m.admin_error_generic());
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    setBusy(true);
    setGeneratedPassword("");
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setAuthenticated(false);
      setGroups([]);
    } catch {
      setError(m.admin_error_generic());
    } finally {
      setBusy(false);
    }
  }

  async function generatePassword() {
    setError("");
    setNotice("");
    setGeneratedPassword("");
    setBusy(true);
    try {
      const response = await fetch(
        `/api/admin/groups/${selectedGroup}/password`,
        { method: "POST" },
      );
      const data = (await response.json()) as {
        password?: string;
        error?: string;
      };
      if (!response.ok || !data.password) {
        throw new Error(data.error ?? "admin_error_generic");
      }
      setGeneratedPassword(data.password);
      await loadGroups();
    } catch {
      setError(m.admin_error_generic());
    } finally {
      setBusy(false);
    }
  }

  async function toggleAccount(active: boolean) {
    setError("");
    setNotice("");
    setGeneratedPassword("");
    setBusy(true);
    try {
      const response = await fetch(
        `/api/admin/groups/${selectedGroup}/active`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active }),
        },
      );
      if (!response.ok) throw new Error();
      await loadGroups();
    } catch {
      setError(m.admin_error_generic());
    } finally {
      setBusy(false);
    }
  }

  async function copyPassword() {
    try {
      await navigator.clipboard.writeText(generatedPassword);
      setNotice(m.admin_password_copied());
    } catch {
      setError(m.admin_error_generic());
    }
  }

  async function downloadSubmission() {
    setError("");
    try {
      const response = await fetch(
        `/api/admin/groups/${selectedGroup}/submission`,
      );
      if (!response.ok) throw new Error();
      const objectUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `grupo${selectedGroup}.asm`;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
    } catch {
      setError(m.admin_error_generic());
    }
  }

  function selectGroup(group: string) {
    setSelectedGroup(group);
    setGeneratedPassword("");
    setError("");
    setNotice("");
  }

  const selected = groups.find((group) => group.group === selectedGroup);

  return (
    <main className="min-h-dvh bg-linear-to-b from-case-top to-case-bottom p-4 text-silk sm:p-8">
      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link
              className="mb-4 inline-flex items-center gap-2 text-sm text-silk-2 hover:text-silk-hi"
              to="/entregas"
            >
              <ArrowLeftIcon aria-hidden className="size-4" />
              {m.upload_title()}
            </Link>
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-xl border border-edge bg-background text-phosphor">
                <ShieldIcon aria-hidden className="size-5" />
              </span>
              <div>
                <h1 className="text-2xl font-semibold text-silk-hi">
                  {m.admin_title()}
                </h1>
                <p className="mt-1 text-sm text-silk-2">
                  {m.admin_description()}
                </p>
              </div>
            </div>
          </div>
          {authenticated && (
            <Button disabled={busy} onClick={handleLogout} variant="outline">
              <LogOutIcon aria-hidden />
              {m.admin_logout()}
            </Button>
          )}
        </header>

        {!authenticated ? (
          <section className="mx-auto w-full max-w-md rounded-2xl border border-seam bg-case-2 p-6 shadow-lg sm:p-8">
            <form className="space-y-5" onSubmit={handleLogin}>
              <label className="block space-y-2 text-sm font-medium">
                <span>{m.admin_password_label()}</span>
                <Input
                  autoComplete="current-password"
                  onChange={(event) => setPassword(event.currentTarget.value)}
                  required
                  type="password"
                  value={password}
                />
              </label>
              {error && (
                <p
                  className="rounded-lg border border-destructive/24 bg-destructive/8 p-3 text-sm text-destructive-foreground"
                  role="alert"
                >
                  {error}
                </p>
              )}
              <Button className="w-full" loading={busy} type="submit">
                <ShieldIcon aria-hidden />
                {m.admin_login()}
              </Button>
            </form>
          </section>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.75fr)]">
            <section className="rounded-2xl border border-seam bg-case-2 p-5 shadow-lg sm:p-6">
              <h2 className="mb-4 text-lg font-semibold text-silk-hi">
                {m.admin_group_list()}
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-seam text-silk-2">
                    <tr>
                      <th className="px-3 py-3 font-medium">
                        {m.admin_group_label()}
                      </th>
                      <th className="px-3 py-3 font-medium">
                        {m.admin_account_status()}
                      </th>
                      <th className="px-3 py-3 font-medium">
                        {m.admin_submission_status()}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((group) => (
                      <tr
                        className={`cursor-pointer border-b border-seam/60 hover:bg-background/40 ${selectedGroup === group.group ? "bg-background/60" : ""}`}
                        key={group.group}
                        onClick={() => selectGroup(group.group)}
                      >
                        <td className="px-3 py-3">
                          <button
                            className="font-semibold text-silk-hi"
                            onClick={() => selectGroup(group.group)}
                            type="button"
                          >
                            {group.group}
                          </button>
                        </td>
                        <td className="px-3 py-3">
                          {group.active
                            ? group.passwordConfigured
                              ? m.admin_status_active()
                              : m.admin_status_no_password()
                            : m.admin_status_inactive()}
                        </td>
                        <td className="px-3 py-3">
                          {group.fileName ?? m.admin_no_file()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="space-y-5 rounded-2xl border border-seam bg-case-2 p-5 shadow-lg sm:p-6">
              <div>
                <label className="block space-y-2 text-sm font-medium">
                  <span>{m.admin_select_group()}</span>
                  <select
                    className="h-10 w-full rounded-lg border border-input bg-background px-3 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onChange={(event) => selectGroup(event.currentTarget.value)}
                    value={selectedGroup}
                  >
                    {groups.map((group) => (
                      <option key={group.group} value={group.group}>
                        {m.admin_group_option({ group: group.group })}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="space-y-3 border-t border-seam pt-5">
                <h2 className="text-lg font-semibold text-silk-hi">
                  {m.admin_account_heading()}
                </h2>
                <Button
                  className="w-full"
                  disabled={busy || !selected}
                  onClick={generatePassword}
                >
                  <KeyRoundIcon aria-hidden />
                  {selected?.passwordConfigured
                    ? m.admin_password_regenerate()
                    : m.admin_password_generate()}
                </Button>
                {selected && (
                  <Button
                    className="w-full"
                    disabled={busy}
                    onClick={() => toggleAccount(!selected.active)}
                    variant="outline"
                  >
                    {selected.active
                      ? m.admin_deactivate()
                      : m.admin_activate()}
                  </Button>
                )}
                {generatedPassword && (
                  <div className="space-y-2 rounded-lg border border-success/24 bg-success/8 p-3">
                    <p className="text-sm text-success">
                      {m.admin_password_once()}
                    </p>
                    <div className="flex gap-2">
                      <Input
                        aria-label={m.admin_generated_password()}
                        readOnly
                        value={generatedPassword}
                      />
                      <Button
                        aria-label={m.admin_password_copy()}
                        onClick={copyPassword}
                        variant="outline"
                      >
                        <CopyIcon aria-hidden />
                      </Button>
                    </div>
                    <p className="break-all font-mono text-sm text-silk-hi">
                      {generatedPassword}
                    </p>
                  </div>
                )}
                {notice && (
                  <p
                    className="flex items-center gap-2 text-sm text-success"
                    role="status"
                  >
                    <CheckIcon aria-hidden className="size-4" />
                    {notice}
                  </p>
                )}
              </div>

              <div className="space-y-3 border-t border-seam pt-5">
                <h2 className="text-lg font-semibold text-silk-hi">
                  {m.admin_files_heading()}
                </h2>
                {selected?.fileName ? (
                  <>
                    <dl className="space-y-2 text-sm">
                      <div className="flex justify-between gap-3">
                        <dt className="text-silk-2">{m.admin_file_name()}</dt>
                        <dd className="break-all text-right">
                          {selected.fileName}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-silk-2">{m.admin_file_size()}</dt>
                        <dd>
                          {m.admin_file_size_value({
                            size: String(selected.fileSize ?? 0),
                          })}
                        </dd>
                      </div>
                      {selected.uploadedAt && (
                        <div className="flex justify-between gap-3">
                          <dt className="text-silk-2">
                            {m.admin_uploaded_at()}
                          </dt>
                          <dd>
                            {new Date(selected.uploadedAt).toLocaleString()}
                          </dd>
                        </div>
                      )}
                    </dl>
                    <Button
                      className="w-full"
                      onClick={downloadSubmission}
                      variant="outline"
                    >
                      <DownloadIcon aria-hidden />
                      {m.admin_file_download()}
                    </Button>
                  </>
                ) : (
                  <p className="text-sm text-silk-2">{m.admin_no_file()}</p>
                )}
              </div>

              {error && (
                <p
                  className="rounded-lg border border-destructive/24 bg-destructive/8 p-3 text-sm text-destructive-foreground"
                  role="alert"
                >
                  {error}
                </p>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
