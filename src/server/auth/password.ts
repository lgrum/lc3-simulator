/**
 * Password hashing that fits the Workers free plan's 10 ms of CPU per
 * request: PBKDF2-SHA256 through WebCrypto, applied to
 * HMAC-SHA256(pepper, password). The pepper is a Worker secret, so a leaked
 * copy of the database can't be cracked on its own.
 *
 * Stored as `pbkdf2-sha256$<iterations>$<salt>$<hash>`, with the salt and hash
 * in base64. Each hash records its iteration count, so the configured count
 * can change and old hashes still verify.
 *
 * Shared by the Worker and the admin CLI scripts, so it uses only WebCrypto.
 */

export const ALGORITHM = "pbkdf2-sha256";
/** Typed passwords need this many characters to make up for the low cost. */
export const MIN_PASSWORD_LENGTH = 10;
/** The Workers runtime refuses PBKDF2 above this. */
export const MAX_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BITS = 256;

export type Hashing = {
  /** The secret mixed into every password before hashing. */
  pepper: string;
  /** PBKDF2 iterations for new hashes. */
  iterations: number;
};

const encoder = new TextEncoder();

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** HMAC-SHA256(pepper, password), the PBKDF2 input. */
async function pepperPassword(
  password: string,
  pepper: string,
): Promise<ArrayBuffer> {
  if (!pepper) throw new Error("The password pepper is not set");
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", key, encoder.encode(password));
}

async function derive(
  password: string,
  pepper: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    await pepperPassword(password, pepper),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    HASH_BITS,
  );
  return new Uint8Array(bits);
}

function checkIterations(iterations: number): void {
  if (
    !Number.isInteger(iterations) ||
    iterations < 1 ||
    iterations > MAX_ITERATIONS
  )
    throw new Error(
      `PBKDF2 iterations must be a whole number from 1 to ${MAX_ITERATIONS}`,
    );
}

export async function hashPassword(
  password: string,
  { pepper, iterations }: Hashing,
): Promise<string> {
  checkIterations(iterations);
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, pepper, salt, iterations);
  return [ALGORITHM, iterations, toBase64(salt), toBase64(hash)].join("$");
}

type ParsedHash = {
  iterations: number;
  salt: Uint8Array<ArrayBuffer>;
  hash: Uint8Array;
};

function parseHash(stored: string): ParsedHash | null {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== ALGORITHM) return null;
  const iterations = Number(parts[1]);
  try {
    checkIterations(iterations);
    return {
      iterations,
      salt: fromBase64(parts[2]),
      hash: fromBase64(parts[3]),
    };
  } catch {
    return null;
  }
}

/** The iteration count a stored hash was made with, or null if unknown. */
export function hashIterations(stored: string): number | null {
  return parseHash(stored)?.iterations ?? null;
}

/** Whether a stored hash should be remade with the configured count. */
export function needsRehash(stored: string, iterations: number): boolean {
  return hashIterations(stored) !== iterations;
}

/** Compares in time that doesn't depend on where the bytes differ. */
function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

export async function verifyPassword(
  stored: string,
  password: string,
  pepper: string,
): Promise<boolean> {
  const parsed = parseHash(stored);
  if (!parsed) return false;
  const hash = await derive(password, pepper, parsed.salt, parsed.iterations);
  return equalBytes(hash, parsed.hash);
}

/**
 * Verifies a password and, when it matches but was hashed with another
 * iteration count, hashes it again with the configured count and passes both
 * hashes to `replace` to store. The stored hash is salted, so it identifies
 * the account without looking it up.
 */
export async function verifyAndRehash(
  stored: string,
  password: string,
  hashing: Hashing,
  replace: (oldHash: string, newHash: string) => Promise<void>,
): Promise<boolean> {
  if (!(await verifyPassword(stored, password, hashing.pepper))) return false;
  if (needsRehash(stored, hashing.iterations))
    await replace(stored, await hashPassword(password, hashing));
  return true;
}
