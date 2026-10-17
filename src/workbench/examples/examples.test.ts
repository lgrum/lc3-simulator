import { describe, expect, it } from "vite-plus/test";

import { assembleModule } from "@/lib/assembler/assemble-source";
import { link } from "@/lib/assembler/linker";
import { createMachineController } from "@/lib/simulator/controller";

import { EXAMPLES } from ".";
import type { SavedProject } from "../lib/project-store";

/** Assembles every file, links from the entry and runs to HALT. */
function runToHalt(project: SavedProject, input = "") {
  const modules = Object.entries(project.files).map(([file, source]) => {
    const result = assembleModule(source, {
      file,
      entry: file === project.entry,
    });
    if (!result.ok) throw result.error;
    return result.module;
  });
  const linked = link(modules, { entry: project.entry });
  if (!linked.ok) throw new Error(linked.diagnostics[0].text);
  const machine = createMachineController();
  machine.load(linked.image);
  machine.input(input);
  for (let i = 0; i < 100_000 && machine.getSnapshot().mcr & 0x8000; i++)
    machine.stepInto();
  return { machine, image: linked.image };
}

const example = (id: string) =>
  EXAMPLES.find((candidate) => candidate.id === id)!.project;

describe("examples", () => {
  it.each(EXAMPLES.map((each) => [each.id, each]))(
    "%s assembles and halts",
    (_, { project }) => {
      const { machine } = runToHalt(project, "hi\n");
      expect(machine.getSnapshot().mcr & 0x8000).toBe(0);
      expect(machine.getSnapshot().output).toMatch(/HALT\n$/);
    },
  );

  it("prints what each example promises", () => {
    const output = (id: string, input?: string) =>
      runToHalt(example(id), input).machine.getSnapshot().output;
    expect(output("hello")).toMatch(/^Hello, LC-3!/);
    expect(output("countdown")).toMatch(/^54321/);
    expect(output("echo", "ok\n")).toMatch(/^Type something: ok\n/);
    expect(runToHalt(example("multiply")).machine.getSnapshot().regs[2]).toBe(
      42,
    );
  });

  it("opens every single-file example as a one-file project", () => {
    for (const { id, project } of EXAMPLES)
      if (id !== "squares")
        expect(Object.keys(project.files)).toEqual([project.entry]);
  });

  it("links the modules example and calls across files with JSRR", () => {
    const { machine, image } = runToHalt(example("squares"));
    expect(machine.getSnapshot().output).toMatch(/^3\*3 \+ 4\*4 = 25\n/);
    expect(image.map.map(({ file }) => file)).toEqual([
      "main.asm",
      "lib/powers.asm",
      "lib/numbers.asm",
      "lib/arith.asm",
    ]);
  });

  it("keeps R1-R6 across calls in the modules example", () => {
    const { image } = runToHalt(example("squares"));
    const machine = createMachineController();
    machine.load(image);
    const square = image.symbols.get("POWERS-SQUARE")!;
    const print = image.symbols.get("NUMBERS-PRINT2")!;
    for (const routine of [square, print]) {
      for (let r = 1; r <= 6; r++)
        machine.writeRegister(`R${r}` as "R1", 0x100 + r);
      machine.writeRegister("R0", 7);
      machine.writeRegister("R7", 0x3000);
      machine.writeRegister("PC", routine);
      for (let i = 0; i < 1000 && machine.getSnapshot().pc !== 0x3000; i++)
        machine.stepInto();
      const { regs } = machine.getSnapshot();
      expect(regs.slice(1, 7)).toEqual([
        0x101, 0x102, 0x103, 0x104, 0x105, 0x106,
      ]);
      if (routine === square) expect(regs[0]).toBe(49);
    }
  });
});
