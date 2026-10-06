import { m } from "@/paraglide/messages";

import countdown from "./countdown.asm?raw";
import echo from "./echo.asm?raw";
import hello from "./hello.asm?raw";
import multiply from "./multiply.asm?raw";

export type Example = {
  fileName: string;
  title: () => string;
  source: string;
};

export const EXAMPLES: ReadonlyArray<Example> = [
  { fileName: "hello.asm", title: m.example_hello, source: hello },
  { fileName: "countdown.asm", title: m.example_countdown, source: countdown },
  { fileName: "echo.asm", title: m.example_echo, source: echo },
  { fileName: "multiply.asm", title: m.example_multiply, source: multiply },
];
