import { describe, expect, it } from "vite-plus/test";

import { assembleSource } from "@/lib/assembler/assemble-source";
import { createMachineController } from "@/lib/simulator/controller";

import { EXAMPLES } from ".";

function runToHalt(source: string, input = "") {
  const result = assembleSource(source);
  if (!result.ok) throw result.error;
  const machine = createMachineController();
  machine.load(result.program);
  machine.input(input);
  for (let i = 0; i < 100_000 && machine.getSnapshot().mcr & 0x8000; i++)
    machine.stepInto();
  return machine;
}

describe("examples", () => {
  it.each(EXAMPLES.map((example) => [example.fileName, example]))(
    "%s assembles and halts",
    (_, example) => {
      const machine = runToHalt(example.source, "hi\n");
      expect(machine.getSnapshot().mcr & 0x8000).toBe(0);
      expect(machine.getSnapshot().output).toMatch(/HALT\n$/);
    },
  );

  it("prints what each example promises", () => {
    const output = (name: string, input?: string) =>
      runToHalt(
        EXAMPLES.find((example) => example.fileName === name)!.source,
        input,
      ).getSnapshot().output;
    expect(output("hello.asm")).toMatch(/^Hello, LC-3!/);
    expect(output("countdown.asm")).toMatch(/^54321/);
    expect(output("echo.asm", "ok\n")).toMatch(/^Type something: ok\n/);
    expect(runToHalt(EXAMPLES[3].source).getSnapshot().regs[2]).toBe(42);
  });
});
