import { m } from "@/paraglide/messages";

import type { SavedProject } from "../lib/project-store";
import countdown from "./countdown.asm?raw";
import echo from "./echo.asm?raw";
import hello from "./hello.asm?raw";
import multiply from "./multiply.asm?raw";
import squaresArith from "./squares/lib/arith.asm?raw";
import squaresNumbers from "./squares/lib/numbers.asm?raw";
import squaresPowers from "./squares/lib/powers.asm?raw";
import squaresMain from "./squares/main.asm?raw";

/** An example is a project; opening one replaces the local project. */
export type Example = {
  id: string;
  title: () => string;
  project: SavedProject;
};

function oneFile(file: string, source: string): SavedProject {
  return { files: { [file]: source }, folders: [], entry: file };
}

export const EXAMPLES: ReadonlyArray<Example> = [
  {
    id: "hello",
    title: m.example_hello,
    project: oneFile("hello.asm", hello),
  },
  {
    id: "countdown",
    title: m.example_countdown,
    project: oneFile("countdown.asm", countdown),
  },
  { id: "echo", title: m.example_echo, project: oneFile("echo.asm", echo) },
  {
    id: "multiply",
    title: m.example_multiply,
    project: oneFile("multiply.asm", multiply),
  },
  {
    id: "squares",
    title: m.example_squares,
    project: {
      files: {
        "main.asm": squaresMain,
        "lib/powers.asm": squaresPowers,
        "lib/arith.asm": squaresArith,
        "lib/numbers.asm": squaresNumbers,
      },
      folders: ["lib"],
      entry: "main.asm",
    },
  },
];

/** Whether `text` is an example's file, unchanged. */
export function isExampleText(text: string): boolean {
  return EXAMPLES.some((example) =>
    Object.values(example.project.files).includes(text),
  );
}
