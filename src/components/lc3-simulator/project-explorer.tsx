import {
  ChevronDown,
  ChevronsLeft,
  FileCode2,
  FilePlus2,
  Folder,
  FolderPlus,
  MoreHorizontal,
  Search,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip";

import { files } from "./data";

function ExplorerAction({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<Button aria-label={label} size="icon-xs" variant="ghost" />}
      >
        {children}
      </TooltipTrigger>
      <TooltipPopup>{label}</TooltipPopup>
    </Tooltip>
  );
}

export function ProjectExplorer() {
  return (
    <aside className="sim-panel hidden min-h-0 w-60 shrink-0 flex-col border-r lg:flex">
      <div className="flex h-11 items-center justify-between border-b px-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Project</span>
          <span className="sim-dim font-mono text-[10px]">OPFS</span>
        </div>
        <ExplorerAction label="Collapse explorer">
          <ChevronsLeft />
        </ExplorerAction>
      </div>

      <div className="flex items-center gap-0.5 border-b px-2 py-1.5">
        <ExplorerAction label="New source file">
          <FilePlus2 />
        </ExplorerAction>
        <ExplorerAction label="New folder">
          <FolderPlus />
        </ExplorerAction>
        <ExplorerAction label="Project actions">
          <MoreHorizontal />
        </ExplorerAction>
      </div>

      <div className="px-2 py-2">
        <InputGroup className="sim-input h-7">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            aria-label="Filter project files"
            placeholder="Filter files"
            size="sm"
          />
        </InputGroup>
      </div>

      <ScrollArea className="min-h-0 flex-1" scrollFade>
        <div className="px-2 pb-4 text-[13px]">
          <Button
            className="h-7 w-full justify-start px-1.5"
            size="xs"
            variant="ghost"
          >
            <ChevronDown className="sim-dim" />
            <Folder className="text-(--sim-amber)" />
            <span>examples</span>
          </Button>
          <div className="ml-3 border-l pl-1.5">
            {files.map((file) => (
              <Button
                className={`h-7 w-full justify-start px-2 font-normal ${
                  file.active ? "sim-file-active" : "sim-dim"
                }`}
                key={file.name}
                size="xs"
                variant="ghost"
              >
                <FileCode2 className={file.active ? "text-(--sim-cyan)" : ""} />
                <span className="truncate">{file.name}</span>
                {file.dirty ? (
                  <span className="ml-auto text-(--sim-amber)">M</span>
                ) : null}
              </Button>
            ))}
          </div>

          <Button
            className="mt-1 h-7 w-full justify-start px-1.5"
            size="xs"
            variant="ghost"
          >
            <ChevronDown className="sim-dim" />
            <Folder className="text-(--sim-amber)" />
            <span>lib</span>
          </Button>
          <div className="ml-3 border-l pl-1.5">
            <Button
              className="sim-dim h-7 w-full justify-start px-2 font-normal"
              size="xs"
              variant="ghost"
            >
              <FileCode2 />
              io.asm
            </Button>
          </div>
        </div>
      </ScrollArea>

      <div className="sim-dim border-t px-3 py-2 text-xs leading-5">
        <div className="flex items-center justify-between">
          <span>Workspace</span>
          <span className="font-mono">4 files</span>
        </div>
        <p>Stored locally in your browser</p>
      </div>
    </aside>
  );
}
