import type { InstructionSpec, IsaDefinition } from "./types";

export type DispatchTable = ReadonlyArray<
  (word: number) => InstructionSpec<any> | undefined
>;
export function buildDispatchTable(isa: IsaDefinition): DispatchTable {
  const slots: Array<Array<InstructionSpec<any>>> = Array.from(
    { length: 16 },
    () => [],
  );
  for (const instruction of isa.instructions) {
    if (
      !Number.isInteger(instruction.opcode) ||
      instruction.opcode < 0 ||
      instruction.opcode > 15
    )
      throw new RangeError("Instruction opcode must be between 0 and 15");
    slots[instruction.opcode].push(instruction);
  }
  return slots.map((variants) => {
    if (variants.length === 1 && !variants[0].match) return () => variants[0];
    return (word: number) =>
      variants.find((instruction) => instruction.match?.(word) ?? true);
  });
}
