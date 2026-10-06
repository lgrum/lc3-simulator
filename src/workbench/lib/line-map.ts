import type { LoadedProgram } from "@/lib/assembler/types";

/** Two-way mapping between source lines (1-based) and machine addresses. */
export type LineMap = {
  /** The first address emitted for a line, e.g. the start of a `.BLKW`. */
  addressOf: ReadonlyMap<number, number>;
  lineOf: ReadonlyMap<number, number>;
};

export function createLineMap(program: Pick<LoadedProgram, "sourceMap">) {
  const addressOf = new Map<number, number>();
  // The source map is filled in emission order, so the first address seen for
  // a line is where that statement starts, even when the image wraps at xFFFF.
  for (const [addr, line] of program.sourceMap)
    if (!addressOf.has(line)) addressOf.set(line, addr);
  return { addressOf, lineOf: program.sourceMap } satisfies LineMap;
}

/**
 * The address for a line, or for the next line that emits code: a label or
 * comment on its own line belongs to the statement after it.
 */
export function addressAtOrAfter(
  lines: LineMap,
  line: number,
): number | undefined {
  let best: [line: number, addr: number] | undefined;
  for (const [candidate, addr] of lines.addressOf)
    if (candidate >= line && (!best || candidate < best[0]))
      best = [candidate, addr];
  return best?.[1];
}
