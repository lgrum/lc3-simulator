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
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { m } from "@/paraglide/messages";

import type { SignInProblem } from "../lib/account-store";
import { useWorkbench } from "../workbench-provider";

function textOf(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

function problemText(problem: SignInProblem): string {
  switch (problem) {
    case "wrong":
      return m.account_login_wrong();
    case "rate-limited":
      return m.account_login_rate_limited();
    case "unreachable":
      return m.account_login_unreachable();
  }
}

/** Groups log in with their number, admins with their username. */
export function LoginDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { account } = useWorkbench();
  const [problem, setProblem] = useState<SignInProblem | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    const result = await account.signIn(
      textOf(form.get("username")),
      textOf(form.get("password")),
    );
    setBusy(false);
    setProblem(result);
    if (!result) onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setProblem(null);
        onOpenChange(next);
      }}
    >
      <DialogPopup className="max-w-sm">
        <form onSubmit={(event) => void submit(event)}>
          <DialogHeader>
            <DialogTitle className="text-base">
              {m.account_log_in()}
            </DialogTitle>
            <DialogDescription>
              {m.account_login_description()}
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="flex flex-col gap-4">
            <Field>
              <FieldLabel>{m.account_username()}</FieldLabel>
              <Input
                name="username"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
                autoFocus
              />
            </Field>
            <Field>
              <FieldLabel>{m.account_password()}</FieldLabel>
              <Input
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </Field>
            {problem && (
              <p role="alert" className="text-sm text-destructive-foreground">
                {problemText(problem)}
              </p>
            )}
          </DialogPanel>
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {m.account_log_in()}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
