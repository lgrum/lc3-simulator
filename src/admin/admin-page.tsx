import { Link, useRouter } from "@tanstack/react-router";
import { ArrowLeftIcon, PlusIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { m } from "@/paraglide/messages";
import type { Viewer } from "@/server/access";
import type { Group } from "@/server/groups";
import {
  createGroupFn,
  deleteGroupFn,
  renameGroupFn,
  resetGroupPasswordFn,
} from "@/server/groups.functions";
import { useAskDialog } from "@/workbench/ui/ask-dialog";
import { Panel, PanelHeader } from "@/workbench/ui/surfaces";

import { GroupDialog, TokenDialog } from "./group-dialog";
import { GroupModules } from "./group-modules";
import type { GroupDialogMode, GroupDialogValues } from "./group-dialog";

/** The error of a failed server call, for the dialog. */
function failure(error: unknown): string {
  return m.admin_error({
    message: error instanceof Error ? error.message : String(error),
  });
}

/** Groups: create, rename, reset password and delete. Admins only. */
export function AdminPage({
  viewer,
  groups,
}: {
  viewer: Extract<Viewer, { kind: "admin" }>;
  groups: Array<Group>;
}) {
  const router = useRouter();
  const { ask, dialog } = useAskDialog();
  const [editing, setEditing] = useState<GroupDialogMode | null>(null);
  const [token, setToken] = useState<{ number: number; token: string } | null>(
    null,
  );
  // The group whose modules are shown, by user id so renames keep it.
  const [viewing, setViewing] = useState<string | null>(null);
  const viewed = groups.find((group) => group.userId === viewing);

  const reload = () => router.invalidate({ sync: true });

  const save = async (
    mode: GroupDialogMode,
    values: GroupDialogValues,
  ): Promise<string | null> => {
    try {
      if (mode.kind === "create") {
        const result = await createGroupFn({ data: values });
        if ("problem" in result)
          return m.admin_group_exists({ number: values.number });
        if (result.token)
          setToken({ number: values.number, token: result.token });
      } else if (mode.kind === "rename") {
        await renameGroupFn({
          data: { userId: mode.group.userId, name: values.name },
        });
      } else {
        const result = await resetGroupPasswordFn({
          data: { userId: mode.group.userId, password: values.password },
        });
        if (result.token)
          setToken({ number: mode.group.number, token: result.token });
      }
    } catch (error) {
      return failure(error);
    }
    setEditing(null);
    await reload();
    return null;
  };

  const remove = async (group: Group) => {
    const yes = await ask({
      title: m.admin_delete_confirm({ number: group.number }),
      description: m.admin_delete_description(),
      confirm: m.admin_delete(),
      destructive: true,
    });
    if (!yes) return;
    try {
      await deleteGroupFn({ data: { userId: group.userId } });
    } catch (error) {
      await ask({ title: failure(error) });
    }
    await reload();
  };

  return (
    <div className="min-h-dvh bg-linear-to-b from-case-top to-case-bottom text-[13px] text-silk">
      <header className="flex h-12 items-center gap-3 border-b border-seam px-3 shadow-[0_1px_0_var(--case-highlight)]">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 rounded-[5px] px-2 py-1 hover:bg-tint/6"
        >
          <ArrowLeftIcon aria-hidden className="size-3.5" />
          {m.admin_back()}
        </Link>
        <h1 className="text-lg font-semibold text-silk-hi">
          {m.admin_title()}
        </h1>
        <span className="ml-auto text-silk/80">
          {m.account_logged_in_as({ name: viewer.name })}
        </span>
      </header>
      <main className="mx-auto flex max-w-4xl flex-col gap-4 p-4">
        <Panel>
          <PanelHeader title={m.admin_groups()}>
            <Button size="sm" onClick={() => setEditing({ kind: "create" })}>
              <PlusIcon aria-hidden />
              {m.admin_new_group()}
            </Button>
          </PanelHeader>
          {groups.length === 0 ? (
            <p className="p-4 text-silk/80">{m.admin_no_groups()}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">
                    {m.admin_group_number()}
                  </TableHead>
                  <TableHead>{m.admin_group_name()}</TableHead>
                  <TableHead className="w-24">{m.admin_modules()}</TableHead>
                  <TableHead className="w-0" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((group) => (
                  <TableRow key={group.userId}>
                    <TableCell className="font-mono">{group.number}</TableCell>
                    <TableCell>{group.name}</TableCell>
                    <TableCell className="font-mono">{group.modules}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-pressed={viewing === group.userId}
                          onClick={() => setViewing(group.userId)}
                        >
                          {m.admin_view_modules()}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditing({ kind: "rename", group })}
                        >
                          {m.admin_rename()}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditing({ kind: "reset", group })}
                        >
                          {m.admin_reset_password()}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive-foreground"
                          onClick={() => void remove(group)}
                        >
                          {m.admin_delete()}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Panel>
        {viewed && <GroupModules key={viewed.userId} group={viewed} />}
      </main>
      <GroupDialog
        mode={editing}
        onClose={() => setEditing(null)}
        onSubmit={save}
      />
      <TokenDialog shown={token} onClose={() => setToken(null)} />
      {dialog}
    </div>
  );
}
