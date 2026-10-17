import type { LinkedImage } from "@/lib/assembler/types";

/** Two-way mapping between one file's lines (1-based) and machine addresses. */
export type LineMap = {
  /** The first address emitted for a line, e.g. the start of a `.BLKW`. */
  addressOf: ReadonlyMap<number, number>;
  lineOf: ReadonlyMap<number, number>;
};

/** One line map per file, built from a linked image's source map. */
export function createLineMaps(
  image: Pick<LinkedImage, "sourceMap">,
): ReadonlyMap<string, LineMap> {
  const maps = new Map<
    string,
    { addressOf: Map<number, number>; lineOf: Map<number, number> }
  >();
  // The source map is filled in emission order, so the first address seen for
  // a line is where that statement starts, even when the image wraps at xFFFF.
  for (const [addr, { file, line }] of image.sourceMap) {
    let map = maps.get(file);
    if (!map) {
      map = { addressOf: new Map(), lineOf: new Map() };
      maps.set(file, map);
    }
    if (!map.addressOf.has(line)) map.addressOf.set(line, addr);
    map.lineOf.set(addr, line);
  }
  return maps;
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
