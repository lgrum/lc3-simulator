import type { LinkedImage } from "./types";

/** A linked program as one block of memory, without the OS. */
export type ProgramWords = { origin: number; words: Array<number> };

/**
 * Lays the image's segments out as one block from the lowest address. The
 * linker packs modules with no gaps; any gap left is filled with zeros.
 */
export function programWords(image: LinkedImage): ProgramWords {
  const segments = image.segments.filter((segment) => segment.words.length);
  if (segments.length === 0) return { origin: image.entry, words: [] };
  const origin = Math.min(...segments.map((segment) => segment.origin));
  const end = Math.max(
    ...segments.map((segment) => segment.origin + segment.words.length),
  );
  const words = Array.from({ length: end - origin }, () => 0);
  for (const segment of segments)
    words.splice(
      segment.origin - origin,
      segment.words.length,
      ...segment.words,
    );
  return { origin, words };
}

/** Four-digit hex words separated by spaces, the origin first. */
export function toHexText({ origin, words }: ProgramWords): string {
  return [origin, ...words]
    .map((word) => (word & 0xffff).toString(16).toUpperCase().padStart(4, "0"))
    .join(" ");
}

/**
 * The LC-3 object file format: big-endian 16-bit words, the origin first,
 * so other simulators can load it.
 */
export function toObjectBytes({
  origin,
  words,
}: ProgramWords): Uint8Array<ArrayBuffer> {
  const all = [origin, ...words];
  const bytes = new Uint8Array(all.length * 2);
  const view = new DataView(bytes.buffer);
  all.forEach((word, i) => view.setUint16(i * 2, word & 0xffff));
  return bytes;
}
