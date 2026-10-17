import { assemble, AssemblerError } from "./assembler";
import type { AssembleOptions } from "./assembler";
import { LexerError, tokenize } from "./lexer";
import { link } from "./linker";
import { parse, ParserError } from "./parser";
import type {
  AssemblyResult,
  Diagnostic,
  LinkedImage,
  ObjectModule,
} from "./types";

export type AssemblyError = LexerError | ParserError | AssemblerError;

export type AssembleSourceResult =
  | { ok: true; program: AssemblyResult; image: LinkedImage }
  | { ok: false; error: AssemblyError };

export type AssembleModuleResult =
  | { ok: true; module: ObjectModule }
  | { ok: false; error: AssemblyError };

export function isAssemblyError(error: unknown): error is AssemblyError {
  return (
    error instanceof LexerError ||
    error instanceof ParserError ||
    error instanceof AssemblerError
  );
}

/** An assembly error as a diagnostic of `file`. */
export function diagnosticOf(error: AssemblyError, file: string): Diagnostic {
  return {
    file,
    position: error.position,
    severity: "error",
    text: error.text,
  };
}

/**
 * Runs the lexer, parser and assembler on one file's text. A missing final
 * newline is added, since the parser requires one after every statement.
 * Errors other than assembly errors are rethrown.
 */
export function assembleModule(
  source: string,
  options: AssembleOptions = {},
): AssembleModuleResult {
  const text = source.endsWith("\n") ? source : source + "\n";
  try {
    return { ok: true, module: assemble(parse(tokenize(text)), options) };
  } catch (error) {
    if (isAssemblyError(error)) return { ok: false, error };
    throw error;
  }
}

/**
 * Assembles editor text as a whole program of one file and links it.
 * `image` is ready to load, with source lines in `file`; `program` is the
 * same code as one block at its load address.
 */
export function assembleSource(
  source: string,
  file = "main.asm",
): AssembleSourceResult {
  const result = assembleModule(source, { file, entry: true });
  if (!result.ok) return result;
  const linked = link([result.module], { entry: file });
  // A lone entry file has nothing to resolve and no space limit.
  if (!linked.ok) throw new Error(linked.diagnostics[0]?.text);
  const { image } = linked;
  const [segment] = image.segments;
  const sourceMap = new Map<number, number>();
  for (const [addr, { line }] of image.sourceMap) sourceMap.set(addr, line);
  return {
    ok: true,
    program: {
      origin: segment.origin,
      words: segment.words,
      symbols: image.symbols,
      sourceMap,
    },
    image,
  };
}
