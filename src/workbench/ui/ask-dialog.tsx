import { useState } from "react";
import type { ReactElement } from "react";

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { m } from "@/paraglide/messages";

export type Question = {
  title: string;
  description?: string;
  /** The label of the button that agrees. Without it, only OK is shown. */
  confirm?: string;
  /** Whether agreeing loses work, e.g. deletes or replaces a file. */
  destructive?: boolean;
};

type Pending = { question: Question; resolve: (yes: boolean) => void };

/**
 * Asks a question in an alert dialog, in place of window.confirm and
 * window.alert. `ask` resolves to whether the user agreed; render `dialog`
 * once in the component that asks.
 */
export function useAskDialog(): {
  ask: (question: Question) => Promise<boolean>;
  dialog: ReactElement;
} {
  // The question stays after the dialog closes, so it doesn't go blank while
  // the dialog fades out.
  const [pending, setPending] = useState<Pending | null>(null);
  const [open, setOpen] = useState(false);

  const ask = (question: Question) =>
    new Promise<boolean>((resolve) => {
      setPending({ question, resolve });
      setOpen(true);
    });

  const answer = (yes: boolean) => {
    pending?.resolve(yes);
    setOpen(false);
  };

  const question = pending?.question;
  const dialog = (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) answer(false);
      }}
    >
      <AlertDialogPopup className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-base leading-snug">
            {question?.title}
          </AlertDialogTitle>
          {question?.description && (
            <AlertDialogDescription>
              {question.description}
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          {question?.confirm ? (
            <>
              <AlertDialogClose render={<Button variant="outline" />}>
                {m.dialog_cancel()}
              </AlertDialogClose>
              <Button
                variant={question.destructive ? "destructive" : "default"}
                onClick={() => answer(true)}
              >
                {question.confirm}
              </Button>
            </>
          ) : (
            <Button onClick={() => answer(true)}>{m.dialog_ok()}</Button>
          )}
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  );
  return { ask, dialog };
}
