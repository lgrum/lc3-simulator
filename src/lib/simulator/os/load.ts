import { assembleSource } from "../../assembler/assemble-source";
import type { LinkedImage } from "../../assembler/types";
import source from "./lc3os.asm?raw";

/** The OS is one more read-only file, under this path. */
export const OS_FILE = "lc3os.asm";

let image: LinkedImage | undefined;
/** The source is an asset; all machine words come from the project's assembler. */
export function assembleOs(): LinkedImage {
  if (!image) {
    const result = assembleSource(source, OS_FILE);
    if (!result.ok) throw result.error;
    image = result.image;
  }
  return structuredClone(image);
}
