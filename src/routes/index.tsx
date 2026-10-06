import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { assemble } from "@/lib/assembler/assembler";
import { tokenize } from "@/lib/assembler/lexer";
import { parse } from "@/lib/assembler/parser";
import { createMachineController } from "@/lib/simulator/controller";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/")({ component: App });

const SMOKE_TEST = `.ORIG x3000
LEA R0, MSG
PUTS
HALT
MSG .STRINGZ "Engine OK"
.END
`;

// Temporary smoke test until the new UI lands: proves the engine and its
// OS asset load in the browser build.
function App() {
  const [output, setOutput] = useState("");

  useEffect(() => {
    const machine = createMachineController();
    machine.load(assemble(parse(tokenize(SMOKE_TEST))));
    const unsubscribe = machine.subscribe(() => {
      setOutput(machine.getSnapshot().output);
    });
    machine.run();
    return () => {
      machine.pause();
      unsubscribe();
    };
  }, []);

  return (
    <main className="p-6">
      <h1 className="text-lg font-semibold">{m.app_title()}</h1>
      <pre data-testid="smoke-output">{output}</pre>
    </main>
  );
}
