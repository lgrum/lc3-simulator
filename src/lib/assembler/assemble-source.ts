import { assemble, AssemblerError } from "./assembler";
import { LexerError, tokenize } from "./lexer";
import { programImage } from "./linked-image";
import { parse, ParserError } from "./parser";
import type { AssemblyResult, LinkedImage } from "./types";

export type AssemblyError = LexerError | ParserError | AssemblerError;

export type AssembleSourceResult =
  | { ok: true; program: AssemblyResult; image: LinkedImage }
  | { ok: false; error: AssemblyError };

export function isAssemblyError(error: unknown): error is AssemblyError {
  return (
    error instanceof LexerError ||
    error instanceof ParserError ||
    error instanceof AssemblerError
  );
}

/**
 * Runs the lexer, parser and assembler on editor text. A missing final newline
 * is added, since the parser requires one after every statement. Errors other
 * than assembly errors are rethrown. `image` is the program ready to load,
 * with its source lines in `file`.
 */
export function assembleSource(
  source: string,
  file = "main.asm",
): AssembleSourceResult {
  const text = source.endsWith("\n") ? source : source + "\n";
  try {
    const program = assemble(parse(tokenize(text)));
    return { ok: true, program, image: programImage(program, file) };
  } catch (error) {
    if (isAssemblyError(error)) return { ok: false, error };
    throw error;
  }
}
