import { assemble } from "../../assembler/assembler";
import { tokenize } from "../../assembler/lexer";
import { parse } from "../../assembler/parser";
import type { LoadedProgram } from "../../assembler/types";
import source from "./lc3os.asm?raw";

let image: LoadedProgram | undefined;
/** The source is an asset; all machine words come from the project's assembler. */
export function assembleOs(): LoadedProgram {
  image ??= assemble(parse(tokenize(source)));
  return structuredClone(image);
}
