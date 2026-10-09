import type { IsaDefinition } from "@/lib/simulator/isa/types";

/** `x3000`, the LC-3 notation for a 16-bit word. */
export function hex(value: number): string {
  return "x" + (value & 0xffff).toString(16).toUpperCase().padStart(4, "0");
}

export function signed(value: number): number {
  const word = value & 0xffff;
  return word & 0x8000 ? word - 0x10000 : word;
}

/** Fixed-point formats run from Q0 (plain integers) to Q15. */
export const MAX_FRACTION_BITS = 15;

/**
 * The word as a two's-complement Qn number: `fractionBits` bits after the
 * binary point, bit 15 the sign. Q0 is the signed integer.
 */
export function fixedPoint(value: number, fractionBits: number): number {
  return signed(value) / 2 ** fractionBits;
}

function trimZeros(text: string): string {
  return text.includes(".") ? text.replace(/\.?0+$/, "") : text;
}

/** Decimals shown before rounding; enough to tell all Q15 values apart. */
const FIXED_DECIMALS = 6;

/**
 * A Qn value as text, e.g. "-0.75". Values needing more than six decimals
 * are rounded and marked with "≈"; `exact` always holds the full value.
 */
export function formatFixed(
  value: number,
  fractionBits: number,
): { text: string; exact: string } {
  const number = fixedPoint(value, fractionBits);
  // A word over 2^n has at most n decimals, so toFixed(n) is exact.
  const exact = trimZeros(number.toFixed(fractionBits));
  const rounded = trimZeros(
    number.toFixed(Math.min(fractionBits, FIXED_DECIMALS)),
  );
  return { text: rounded === exact ? exact : `≈${rounded}`, exact };
}

/**
 * Parses a decimal fraction typed in Qn mode, e.g. `0.75`, `-1.5` or
 * `#0.25`, rounding to the nearest Qn value. Returns undefined for text
 * without a decimal point, for Q0, and for values out of range.
 */
export function parseFixed(
  text: string,
  fractionBits: number,
): number | undefined {
  const input = text.trim().replace(/^#/, "");
  if (fractionBits === 0 || !/^-?(\d+\.\d*|\.\d+)$/.test(input))
    return undefined;
  const raw = Math.round(Number(input) * 2 ** fractionBits);
  if (raw < -0x8000 || raw > 0x7fff) return undefined;
  return raw & 0xffff;
}

/** Bits 15–12, the opcode field. */
export function opcodeBits(value: number): string {
  return ((value >>> 12) & 0xf).toString(2).padStart(4, "0");
}

const CONTROL_NAMES: Record<number, string> = {
  0: "NUL",
  9: "TAB",
  10: "LF",
  13: "CR",
  27: "ESC",
  32: "space",
  127: "DEL",
};

/** A printable description of the word as an ASCII character, if it is one. */
export function asciiOf(value: number): string | undefined {
  if (value > 0x7f) return undefined;
  if (value in CONTROL_NAMES) return CONTROL_NAMES[value];
  if (value < 0x20) return undefined;
  return `'${String.fromCharCode(value)}'`;
}

/**
 * Parses a word typed by the user: `x3000`, `0x3000`, `#12`, `12`, `-1`,
 * `b0101` or a quoted character such as `'A'`. Returns undefined for anything
 * that is not a 16-bit value (signed or unsigned).
 */
export function parseWord(text: string): number | undefined {
  const input = text.trim();
  let value: number;
  if (/^'.'$/.test(input)) value = input.charCodeAt(1);
  else if (/^(0x|x)[0-9a-f]+$/i.test(input))
    value = parseInt(input.replace(/^0?x/i, ""), 16);
  else if (/^b[01]+$/i.test(input)) value = parseInt(input.slice(1), 2);
  else if (/^#?-?\d+$/.test(input)) value = Number(input.replace("#", ""));
  else return undefined;
  if (!Number.isInteger(value) || value < -0x8000 || value > 0xffff)
    return undefined;
  return value & 0xffff;
}

/** The mnemonic of an instruction word, e.g. for the IR. */
export function mnemonicOf(
  isa: Pick<IsaDefinition, "instructions">,
  word: number,
): string | undefined {
  return isa.instructions.find(
    (spec) => spec.opcode === word >>> 12 && (spec.match?.(word) ?? true),
  )?.mnemonic;
}

/** Looks up an address typed as a number or a label, e.g. `x3000` or `LOOP`. */
export function resolveAddress(
  text: string,
  lookup: (name: string) => number | string | undefined,
): number | undefined {
  const word = parseWord(text);
  if (word !== undefined) return word;
  const symbol = text.trim() === "" ? undefined : lookup(text.trim());
  return typeof symbol === "number" ? symbol : undefined;
}
