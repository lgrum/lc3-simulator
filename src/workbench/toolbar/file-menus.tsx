import { ChevronDownIcon } from "lucide-react";
import { useRef } from "react";

import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { m } from "@/paraglide/messages";

import { EXAMPLES } from "../examples";
import type { SourceFile } from "../lib/source-store";
import { Key } from "../ui/key";
import { useWorkbench } from "../workbench-provider";
import type { Workbench } from "../workbench-provider";

const NEW_FILE: SourceFile = {
  name: "untitled.asm",
  text: "; New program\n        .ORIG x3000\n\n        HALT\n        .END\n",
};

/** Whether replacing the buffer would lose work that only exists here. */
function hasOwnWork({ source }: Workbench): boolean {
  const { text } = source.getFile();
  return (
    text.trim() !== "" &&
    text !== NEW_FILE.text &&
    !EXAMPLES.some((example) => example.source === text)
  );
}

function useOpenFile() {
  const workbench = useWorkbench();
  return (file: SourceFile) => {
    if (hasOwnWork(workbench) && !window.confirm(m.file_replace_confirm()))
      return;
    workbench.assembly.openFile(file);
  };
}

function download({ name, text }: SourceFile) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name.endsWith(".asm") ? name : `${name}.asm`;
  link.click();
  URL.revokeObjectURL(url);
}

function MenuKey({ children }: { children: React.ReactNode }) {
  return (
    <MenuTrigger render={<Key tone="flat" />}>
      {children}
      <ChevronDownIcon aria-hidden />
    </MenuTrigger>
  );
}

export function FileMenu() {
  const workbench = useWorkbench();
  const openFile = useOpenFile();
  const input = useRef<HTMLInputElement>(null);

  return (
    <>
      <Menu>
        <MenuKey>{m.menu_file()}</MenuKey>
        <MenuPopup align="start">
          <MenuItem onClick={() => openFile(NEW_FILE)}>{m.file_new()}</MenuItem>
          <MenuItem onClick={() => input.current?.click()}>
            {m.file_open()}
          </MenuItem>
          <MenuSeparator />
          <MenuItem onClick={() => download(workbench.source.getFile())}>
            {m.file_save()}
          </MenuItem>
        </MenuPopup>
      </Menu>
      <input
        ref={input}
        type="file"
        accept=".asm,.txt,text/plain"
        className="hidden"
        aria-hidden
        tabIndex={-1}
        onChange={async (event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) openFile({ name: file.name, text: await file.text() });
        }}
      />
    </>
  );
}

export function ExamplesMenu() {
  const openFile = useOpenFile();
  return (
    <Menu>
      <MenuKey>{m.menu_examples()}</MenuKey>
      <MenuPopup align="start">
        {EXAMPLES.map((example) => (
          <MenuItem
            key={example.fileName}
            onClick={() =>
              openFile({ name: example.fileName, text: example.source })
            }
          >
            {example.title()}
          </MenuItem>
        ))}
      </MenuPopup>
    </Menu>
  );
}
