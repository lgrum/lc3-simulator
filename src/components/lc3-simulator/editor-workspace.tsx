import { useState } from 'react'
import { Binary, Circle, FileCode2, ListFilter, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsPanel, TabsTab } from '@/components/ui/tabs'

import { instructions, sourceLines } from './data'

function SourceLine({ line, number }: { line: string; number: number }) {
  const [breakpoint, setBreakpoint] = useState(number === 8)
  const trimmed = line.trim()
  const isComment = trimmed.startsWith(';')
  const isDirective = trimmed.startsWith('.')

  return (
    <div
      className={`sim-code-line group flex min-w-max ${number === 8 ? 'sim-current-line' : ''}`}
    >
      <Button
        aria-label={`${breakpoint ? 'Remove' : 'Add'} breakpoint on line ${number}`}
        aria-pressed={breakpoint}
        className="mr-1 size-6 rounded-none border-0 p-0 opacity-70 hover:bg-transparent hover:opacity-100"
        onClick={() => setBreakpoint((value) => !value)}
        size="icon-xs"
        variant="ghost"
      >
        <Circle
          className={
            breakpoint
              ? 'fill-(--sim-red) text-(--sim-red)'
              : 'opacity-0 group-hover:opacity-35'
          }
        />
      </Button>
      <span className="sim-line-number w-9 shrink-0 select-none pr-3 text-right">
        {number}
      </span>
      <code
        className={`block flex-1 pr-8 ${isComment ? 'sim-comment' : isDirective ? 'sim-directive' : ''}`}
      >
        {line || ' '}
      </code>
    </div>
  )
}

export function EditorWorkspace() {
  const [selectedInstruction, setSelectedInstruction] = useState('x3002')

  return (
    <section className="sim-panel flex min-w-0 flex-1 flex-col">
      <Tabs className="min-h-0 flex-1 gap-0" defaultValue="source">
        <div className="flex h-11 items-center justify-between border-b px-2">
          <TabsList className="h-full bg-transparent p-0" variant="underline">
            <TabsTab className="h-full gap-2 rounded-none px-3" value="source">
              <FileCode2 />
              echo.asm
              <span
                aria-label="Unsaved changes"
                className="size-1.5 rounded-full bg-(--sim-amber)"
              />
            </TabsTab>
            <TabsTab className="h-full gap-2 rounded-none px-3" value="listing">
              <Binary />
              Listing
              <Badge className="font-mono" size="sm" variant="secondary">
                16
              </Badge>
            </TabsTab>
          </TabsList>
          <Button aria-label="Close editor tab" size="icon-xs" variant="ghost">
            <X />
          </Button>
        </div>

        <TabsPanel className="min-h-0" value="source">
          <ScrollArea
            className="sim-editor min-h-0 font-mono text-[13px] leading-6"
            scrollbarGutter
          >
            <div className="min-w-max py-3">
              {sourceLines.map((line, index) => (
                <SourceLine
                  key={`${index}-${line}`}
                  line={line}
                  number={index + 1}
                />
              ))}
            </div>
          </ScrollArea>
        </TabsPanel>

        <TabsPanel className="min-h-0" value="listing">
          <ScrollArea className="min-h-0" scrollbarGutter>
            <Table className="font-mono text-xs">
              <TableHeader className="sim-table-head sticky top-0 z-10 bg-(--sim-panel)">
                <TableRow>
                  <TableHead className="w-8">
                    <span className="sr-only">Breakpoint</span>
                  </TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead>Instruction</TableHead>
                  <TableHead>Operands</TableHead>
                  <TableHead>Machine code</TableHead>
                  <TableHead className="text-right">Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {instructions.map((instruction) => {
                  const selected = selectedInstruction === instruction.address
                  return (
                    <TableRow
                      className={`cursor-pointer ${selected ? 'sim-instruction-active' : ''}`}
                      data-state={selected ? 'selected' : undefined}
                      key={instruction.address}
                      onClick={() =>
                        setSelectedInstruction(instruction.address)
                      }
                    >
                      <TableCell>
                        {instruction.address === 'x3002' ? (
                          <Circle className="size-2.5 fill-(--sim-red) text-(--sim-red)" />
                        ) : null}
                      </TableCell>
                      <TableCell className="sim-address">
                        {instruction.address}
                      </TableCell>
                      <TableCell className="text-(--sim-violet)">
                        {instruction.label || '—'}
                      </TableCell>
                      <TableCell className="font-semibold text-(--sim-cyan)">
                        {instruction.opcode}
                      </TableCell>
                      <TableCell>{instruction.operands || '—'}</TableCell>
                      <TableCell className="sim-dim">
                        {instruction.hex}
                      </TableCell>
                      <TableCell className="sim-dim text-right">
                        {instruction.source}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </ScrollArea>
        </TabsPanel>
      </Tabs>

      <div className="sim-dim flex h-7 items-center gap-4 border-t px-3 font-mono text-[10px]">
        <span>Ln 8, Col 1</span>
        <span>UTF-8</span>
        <span>Spaces: 2</span>
        <span className="ml-auto flex items-center gap-1">
          <ListFilter className="size-3" /> LC-3 Assembly
        </span>
      </div>
    </section>
  )
}
