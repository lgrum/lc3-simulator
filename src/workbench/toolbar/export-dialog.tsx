import { CopyIcon, DownloadIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { programWords, toHexText, toObjectBytes } from "@/lib/assembler/export";
import { moduleName } from "@/lib/assembler/linker";
import { m } from "@/paraglide/messages";

import { downloadFile } from "../files/shared";
import { useAssembly, useIsStale, useProject } from "../workbench-provider";

/**
 * Shows the last assembled program in hex, to copy, or saves it as a .obj
 * object file. Only the program and its modules: the OS is not included.
 */
export function ExportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { image } = useAssembly();
  const stale = useIsStale();
  const { entry } = useProject();
  const [copied, setCopied] = useState(false);
  const program = image ? programWords(image) : null;
  const hex = program ? toHexText(program) : "";
  const words = hex === "" ? [] : hex.split(" ");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setCopied(false);
      }}
    >
      <DialogPopup className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">{m.export_title()}</DialogTitle>
          {stale && (
            <p className="text-sm text-warning-foreground">
              {m.export_stale()}
            </p>
          )}
        </DialogHeader>
        <DialogPanel>
          {/*
           * As many four-character columns as fit, spread to both edges so
           * no gap is left on the right. Grid cells copy as lines, so a
           * selection is copied with spaces, like the button's text.
           */}
          <p
            aria-label={m.export_hex_label()}
            onCopy={(event) => {
              event.preventDefault();
              event.clipboardData.setData(
                "text/plain",
                String(getSelection()).trim().split(/\s+/).join(" "),
              );
            }}
            className="grid grid-cols-[repeat(auto-fill,4ch)] justify-between gap-x-[1ch] rounded-md bg-screen px-3 py-2 font-mono text-sm text-phosphor select-all"
          >
            {words.map((word, i) => (
              <span key={i}>
                {word}
                {i < words.length - 1 && " "}
              </span>
            ))}
          </p>
        </DialogPanel>
        <DialogFooter>
          <Button
            variant="outline"
            disabled={!program}
            onClick={() =>
              void navigator.clipboard
                .writeText(hex)
                .then(() => setCopied(true))
            }
          >
            <CopyIcon aria-hidden />
            {copied ? m.export_copied() : m.export_copy()}
          </Button>
          <Button
            disabled={!program}
            onClick={() => {
              if (program)
                downloadFile(
                  `${moduleName(entry)}.obj`,
                  toObjectBytes(program),
                  "application/octet-stream",
                );
            }}
          >
            <DownloadIcon aria-hidden />
            {m.export_download()}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
