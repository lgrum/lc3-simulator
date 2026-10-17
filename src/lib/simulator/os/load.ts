import { assemble } from "../../assembler/assembler";
import { tokenize } from "../../assembler/lexer";
import { programImage } from "../../assembler/linked-image";
import { parse } from "../../assembler/parser";
import type { LinkedImage } from "../../assembler/types";
import source from "./lc3os.asm?raw";

/** The OS is one more read-only file, under this path. */
export const OS_FILE = "lc3os.asm";

let image: LinkedImage | undefined;
/** The source is an asset; all machine words come from the project's assembler. */
export function assembleOs(): LinkedImage {
  image ??= programImage(assemble(parse(tokenize(source))), OS_FILE);
  return structuredClone(image);
}
