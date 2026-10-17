import type { LinkedImage, LoadedProgram } from "./types";

/** A file's module name: its base name without `.asm`. */
export function moduleName(file: string): string {
  const base = file.slice(file.lastIndexOf("/") + 1);
  return base.replace(/\.asm$/i, "");
}

/** Wraps a program assembled at its `.ORIG` as a one-segment image. */
export function programImage(
  program: LoadedProgram,
  file: string,
): LinkedImage {
  const sourceMap = new Map<number, { file: string; line: number }>();
  for (const [addr, line] of program.sourceMap)
    sourceMap.set(addr, { file, line });
  const symbols = [...program.symbols].map(([name, addr]) => ({ name, addr }));
  return {
    entry: program.origin,
    segments: [{ origin: program.origin, words: program.words, file }],
    symbols: new Map(program.symbols),
    sourceMap,
    map: [
      {
        file,
        module: moduleName(file),
        start: program.origin,
        end: (program.origin + Math.max(program.words.length, 1) - 1) & 0xffff,
        symbols,
      },
    ],
  };
}
