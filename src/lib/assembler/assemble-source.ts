import { assemble, AssemblerError } from "./assembler";
import { LexerError, tokenize } from "./lexer";
import { parse, ParserError } from "./parser";
import type { AssemblyResult } from "./types";

export type AssemblyError = LexerError | ParserError | AssemblerError;

export type AssembleSourceResult =
  | { ok: true; program: AssemblyResult }
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
 * than assembly errors are rethrown.
 */
export function assembleSource(source: string): AssembleSourceResult {
  const text = source.endsWith("\n") ? source : source + "\n";
  try {
    return { ok: true, program: assemble(parse(tokenize(text))) };
  } catch (error) {
    if (isAssemblyError(error)) return { ok: false, error };
    throw error;
  }
}
