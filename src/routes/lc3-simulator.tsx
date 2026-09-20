import { createFileRoute } from '@tanstack/react-router'

import { SimulatorShell } from '@/components/lc3-simulator/simulator-shell'

export const Route = createFileRoute('/lc3-simulator')({
  component: Lc3SimulatorPage,
  head: () => ({
    meta: [
      {
        title: 'LC-3 Workbench · Assembler & Simulator',
      },
      {
        name: 'description',
        content:
          'An educational workspace for writing, assembling, and simulating LC-3 programs.',
      },
    ],
  }),
})

function Lc3SimulatorPage() {
  return <SimulatorShell />
}
