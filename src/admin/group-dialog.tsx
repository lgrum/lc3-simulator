import { useState } from "react";
import type { FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Radio, RadioGroup } from "@/components/ui/radio-group";
import { m } from "@/paraglide/messages";
import { MIN_PASSWORD_LENGTH } from "@/server/auth/password";
import type { Group, NewPassword } from "@/server/groups";

/** What the dialog edits: a new group, a group's name or its password. */
export type GroupDialogMode =
  | { kind: "create" }
  | { kind: "rename"; group: Group }
  | { kind: "reset"; group: Group };

export type GroupDialogValues = {
  number: number;
  name: string;
  password: NewPassword;
};

function textOf(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

function titleOf(mode: GroupDialogMode): string {
  switch (mode.kind) {
    case "create":
      return m.admin_new_group();
    case "rename":
      return m.admin_rename_title({ number: mode.group.number });
    case "reset":
      return m.admin_reset_title({ number: mode.group.number });
  }
}

/** Generate a token (the default) or type the password the group chose. */
function PasswordChoice() {
  const [kind, setKind] = useState<NewPassword["kind"]>("generate");
  // Two fields: a field names every control in it after its own name.
  return (
    <>
      <Field name="passwordKind">
        <FieldLabel>{m.account_password()}</FieldLabel>
        <RadioGroup
          name="passwordKind"
          value={kind}
          onValueChange={(value) => setKind(value as NewPassword["kind"])}
          className="gap-2"
        >
          <label className="flex items-center gap-2 text-sm">
            <Radio value="generate" />
            {m.admin_password_generate()}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Radio value="typed" />
            {m.admin_password_typed()}
          </label>
        </RadioGroup>
      </Field>
      {kind === "typed" && (
        <Field name="password">
          <Input
            type="text"
            autoComplete="off"
            spellCheck={false}
            minLength={MIN_PASSWORD_LENGTH}
            maxLength={128}
            required
            aria-label={m.account_password()}
          />
          <FieldDescription>
            {m.admin_password_min({ count: MIN_PASSWORD_LENGTH })}
          </FieldDescription>
        </Field>
      )}
    </>
  );
}

/**
 * Creates a group, renames one or resets its password. `onSubmit` returns an
 * error to show, or null when done.
 */
export function GroupDialog({
  mode,
  onClose,
  onSubmit,
}: {
  mode: GroupDialogMode | null;
  onClose: () => void;
  onSubmit: (
    mode: GroupDialogMode,
    values: GroupDialogValues,
  ) => Promise<string | null>;
}) {
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Keeps the last mode while the dialog fades out.
  const [shown, setShown] = useState(mode);
  if (mode && mode !== shown) {
    setShown(mode);
    setProblem(null);
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!shown) return;
    const form = new FormData(event.currentTarget);
    const password: NewPassword =
      textOf(form.get("passwordKind")) === "typed"
        ? { kind: "typed", password: textOf(form.get("password")) }
        : { kind: "generate" };
    setBusy(true);
    const error = await onSubmit(shown, {
      number: Number(textOf(form.get("number"))),
      name: textOf(form.get("name")).trim(),
      password,
    });
    setBusy(false);
    setProblem(error);
  };

  const group = shown && shown.kind !== "create" ? shown.group : null;
  return (
    <Dialog
      open={mode !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPopup className="max-w-sm">
        {shown && (
          <form onSubmit={(event) => void submit(event)}>
            <DialogHeader>
              <DialogTitle className="text-base">{titleOf(shown)}</DialogTitle>
              {shown.kind === "reset" && (
                <DialogDescription>
                  {m.admin_reset_description()}
                </DialogDescription>
              )}
            </DialogHeader>
            <DialogPanel className="flex flex-col gap-4">
              {shown.kind === "create" && (
                <Field>
                  <FieldLabel>{m.admin_group_number()}</FieldLabel>
                  <Input
                    name="number"
                    type="number"
                    min={1}
                    max={999999}
                    step={1}
                    required
                    autoFocus
                  />
                </Field>
              )}
              {shown.kind !== "reset" && (
                <Field>
                  <FieldLabel>{m.admin_group_name()}</FieldLabel>
                  <Input
                    name="name"
                    defaultValue={group?.name}
                    maxLength={60}
                    required
                    autoFocus={shown.kind === "rename"}
                  />
                </Field>
              )}
              {shown.kind !== "rename" && <PasswordChoice />}
              {problem && (
                <p role="alert" className="text-sm text-destructive-foreground">
                  {problem}
                </p>
              )}
            </DialogPanel>
            <DialogFooter>
              <Button type="submit" disabled={busy}>
                {shown.kind === "create"
                  ? m.admin_create()
                  : shown.kind === "rename"
                    ? m.admin_save()
                    : m.admin_reset()}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogPopup>
    </Dialog>
  );
}

/** Shows a generated password once, with a copy button. */
export function TokenDialog({
  shown,
  onClose,
}: {
  shown: { number: number; token: string } | null;
  onClose: () => void;
}) {
  const [last, setLast] = useState(shown);
  if (shown && shown !== last) setLast(shown);
  return (
    <Dialog
      open={shown !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPopup className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">
            {m.admin_token_title({ number: last?.number ?? 0 })}
          </DialogTitle>
          <DialogDescription>{m.admin_token_description()}</DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <output className="block rounded-md bg-screen px-3 py-2 font-mono text-base text-phosphor select-all">
            {last?.token}
          </output>
        </DialogPanel>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() =>
              void navigator.clipboard.writeText(last?.token ?? "")
            }
          >
            {m.admin_copy()}
          </Button>
          <Button onClick={onClose}>{m.dialog_ok()}</Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
