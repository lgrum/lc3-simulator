import {
  BookOpen,
  Box,
  Bug,
  ChevronDown,
  CircuitBoard,
  CircleStop,
  Files,
  Github,
  PanelLeft,
  Play,
  RotateCcw,
  Settings,
  StepForward,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Tooltip,
  TooltipPopup,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

import { ConsolePanel } from './console-panel'
import { EditorWorkspace } from './editor-workspace'
import { MachineInspector } from './machine-inspector'
import { MobileWorkbench } from './mobile-workbench'
import { ProjectExplorer } from './project-explorer'

function IconAction({
  label,
  children,
  active = false,
}: {
  label: string
  children: React.ReactNode
  active?: boolean
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={label}
            aria-pressed={active}
            className={active ? 'sim-icon-active' : ''}
            size="icon"
            variant="ghost"
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipPopup side="right">{label}</TooltipPopup>
    </Tooltip>
  )
}

export function SimulatorShell() {
  return (
    <TooltipProvider>
      <main className="simulator-app flex h-dvh min-h-140 w-full flex-col overflow-hidden">
        <header className="sim-topbar flex h-13 shrink-0 items-center gap-2 border-b px-2 sm:px-3">
          <div className="flex min-w-0 items-center gap-2 sm:w-60">
            <div className="sim-logo-grid grid size-8 shrink-0 place-items-center rounded-lg border">
              <CircuitBoard className="size-4 text-(--sim-amber)" />
            </div>
            <div className="hidden min-w-0 sm:block">
              <div className="truncate text-sm font-semibold tracking-tight">
                LC-3 Workbench
              </div>
              <div className="sim-dim font-mono text-[9px]">
                assembler / simulator
              </div>
            </div>
          </div>

          <Separator className="mx-1 h-6" orientation="vertical" />

          <Button className="hidden gap-2 md:flex" size="sm" variant="ghost">
            <Box /> examples / echo.asm <ChevronDown />
          </Button>

          <div className="ml-auto flex items-center gap-1">
            <Badge
              className="mr-1 hidden gap-1.5 font-mono sm:inline-flex"
              variant="outline"
            >
              <span className="size-1.5 rounded-full bg-(--sim-amber)" /> x3002
            </Badge>
            <Button className="sim-assemble-button" size="sm" variant="outline">
              <CircuitBoard />{' '}
              <span className="hidden sm:inline">Assemble</span>
            </Button>
            <Button className="sim-run-button" size="sm">
              <Play /> <span className="hidden sm:inline">Run</span>
            </Button>
            <Button
              aria-label="More run actions"
              className="sim-run-caret"
              size="icon-sm"
            >
              <ChevronDown />
            </Button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <nav
            aria-label="Workbench tools"
            className="sim-activitybar flex w-12 shrink-0 flex-col items-center gap-1 border-r py-2"
          >
            <IconAction active label="Explorer">
              <Files />
            </IconAction>
            <IconAction label="Search">
              <PanelLeft />
            </IconAction>
            <IconAction label="Debug">
              <Bug />
            </IconAction>
            <Separator className="my-1 w-6" />
            <IconAction label="Reset machine">
              <RotateCcw />
            </IconAction>
            <IconAction label="Stop simulation">
              <CircleStop />
            </IconAction>
            <IconAction label="Step instruction">
              <StepForward />
            </IconAction>
            <div className="mt-auto flex flex-col gap-1">
              <IconAction label="LC-3 reference">
                <BookOpen />
              </IconAction>
              <IconAction label="View source on GitHub">
                <Github />
              </IconAction>
              <IconAction label="Settings">
                <Settings />
              </IconAction>
            </div>
          </nav>

          <ProjectExplorer />

          <div className="hidden min-w-0 flex-1 grid-rows-[minmax(0,1fr)_auto] md:grid">
            <div className="flex min-h-0">
              <EditorWorkspace />
              <MachineInspector />
            </div>
            <ConsolePanel />
          </div>
          <MobileWorkbench />
        </div>

        <footer className="sim-statusbar flex h-6 shrink-0 items-center gap-3 px-2 font-mono text-[10px]">
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-(--sim-console-green)" />{' '}
            Ready
          </span>
          <span className="hidden sm:inline">0 errors</span>
          <span className="hidden sm:inline">1 breakpoint</span>
          <span className="ml-auto">LC-3 · x3000–xFDFF</span>
        </footer>
      </main>
    </TooltipProvider>
  )
}
