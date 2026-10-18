import { splitQualifiedName } from "./parser";
import type {
  Diagnostic,
  LinkMapEntry,
  LinkResult,
  LinkedImage,
  ObjectModule,
  Segment,
  SourceLocation,
} from "./types";

/** Where the entry file goes when it has no .ORIG. */
export const DEFAULT_ORIGIN = 0x3000;
/** The last address of user memory; packed modules must end at or below. */
export const USER_END = 0xfdff;

export type LinkOptions = {
  /** The project path of the entry file. */
  entry: string;
  /**
   * Admin builds: turn each import nothing provides (no such module or no
   * such label) into a one-word RET after the last module, with a warning.
   */
  stubMissing?: boolean;
};

/** Where RET stubs for missing imports go, in segments and the link map. */
export const STUBS_FILE = "(stubs)";
/** `RET`: what a call to a stubbed import runs. */
const RET = 0xc1c0;

/** The OS file's module name. Programs reach the OS through TRAP. */
export const OS_MODULE = "lc3os";

export function baseName(file: string): string {
  return file.slice(file.lastIndexOf("/") + 1);
}

/** A file's module name: its base name without `.asm`. */
export function moduleName(file: string): string {
  return baseName(file).replace(/\.asm$/i, "");
}

/** `x3000`, or more digits for addresses past the top of memory. */
function hex(value: number): string {
  return "x" + value.toString(16).toUpperCase().padStart(4, "0");
}

/** The addresses a segment covers, wrapping past xFFFF. */
function covers(segment: Segment, addr: number): boolean {
  return ((addr - segment.origin) & 0xffff) < segment.words.length;
}

/** Pairs of segments that share an address. */
export function overlappingSegments(
  segments: ReadonlyArray<Segment>,
): Array<[Segment, Segment]> {
  const pairs: Array<[Segment, Segment]> = [];
  segments.forEach((a, i) => {
    for (const b of segments.slice(i + 1))
      if (
        a.words.length > 0 &&
        b.words.length > 0 &&
        (covers(a, b.origin) || covers(b, a.origin))
      )
        pairs.push([a, b]);
  });
  return pairs;
}

/** The instruction a PC-relative word belongs to, for range errors. */
function mnemonic(word: number): string {
  const opcode = word >>> 12;
  if (opcode === 0) {
    const flags = ["n", "z", "p"].filter((_, i) => word & (0x800 >> i));
    return flags.length === 3 ? "BR" : `BR${flags.join("")}`;
  }
  const names: Record<number, string> = {
    0x2: "LD",
    0x3: "ST",
    0x4: "JSR",
    0xa: "LDI",
    0xb: "STI",
    0xe: "LEA",
  };
  return names[opcode] ?? "?";
}

/** What to write instead of a PC-relative reference that doesn't reach. */
function advice(name: string): string {
  if (name === "JSR" || name.startsWith("BR")) return "Use .FILL with JSRR.";
  if (name === "LEA") return "Use .FILL with LD.";
  return "Use .FILL with LDR or STR.";
}

/**
 * How a label shows in the debugger: prefixed unless it is the entry's. The
 * prefix is the file's base name, the name the project uses for the module
 * (group 7's `trig` shows as `G7_TRIG-SIN` in an admin's build).
 */
export function displayName(
  module: ObjectModule,
  label: string,
  isEntry: boolean,
): string {
  return isEntry ? label : `${moduleName(module.file).toUpperCase()}-${label}`;
}

/** How admins name group modules: `g7_trig` is group 7's `trig`. */
const GROUP_MODULE = /^g(\d+)_(.+)$/i;

/**
 * The module an import names, as namespace and name. Imports resolve in the
 * importer's namespace, except that an admin's `g<n>_<name>` means group
 * n's module `name`. Group modules' own imports stay in the group's
 * namespace, so group 7's `HELPERS-X` finds group 7's `helpers`.
 */
export function resolveImport(
  namespace: string,
  name: string,
): { namespace: string; name: string } {
  const group = namespace.startsWith("admin:") && GROUP_MODULE.exec(name);
  return group
    ? { namespace: `group:${Number(group[1])}`, name: group[2] }
    : { namespace, name };
}

/**
 * Links object modules into one image. The entry file goes at its .ORIG
 * (x3000 if it has none) and every other module follows it with no gaps, so
 * the same sources always give the same layout. Reports all link errors.
 */
export function link(
  modules: ReadonlyArray<ObjectModule>,
  options: LinkOptions,
): LinkResult {
  const entry = modules.find((module) => module.file === options.entry);
  if (!entry)
    return {
      ok: false,
      diagnostics: [
        {
          file: null,
          position: null,
          severity: "error",
          text: `There is no entry file ${options.entry}`,
        },
      ],
    };

  const errors: Array<Diagnostic> = [];
  const error = (file: string | null, line: number | null, text: string) =>
    errors.push({
      file,
      position: line === null ? null : { line },
      severity: "error",
      text,
    });

  // A module is named by its file's base name, so two files with the same
  // base name in one project can't both be modules.
  const byName = new Map<string, Array<ObjectModule>>();
  for (const module of modules) {
    const key = `${module.namespace}:${module.name.toLowerCase()}`;
    byName.set(key, [...(byName.get(key) ?? []), module]);
  }
  for (const same of byName.values())
    if (same.length > 1) {
      const files = same.map((module) => module.file);
      const list = `${files.slice(0, -1).join(", ")} and ${files.at(-1)}`;
      const count = same.length === 2 ? "Two" : String(same.length);
      error(
        null,
        null,
        `${count} files are named ${baseName(files[0])}: ${list}`,
      );
    }

  /** The module an importer means by `name` (see resolveImport). */
  const findModule = (importer: ObjectModule, name: string) => {
    const target = resolveImport(importer.namespace, name);
    return modules.find(
      (module) =>
        module.namespace === target.namespace &&
        module.name.toLowerCase() === target.name.toLowerCase(),
    );
  };

  // With stubMissing, each import nothing provides becomes a RET stub, once
  // per label however many modules import it.
  const stubs: Array<{
    key: string;
    name: string;
    file: string;
    line: number;
  }> = [];
  const stubKey = (importer: ObjectModule, module: string, label: string) => {
    const target = resolveImport(importer.namespace, module);
    return `${target.namespace}:${target.name.toLowerCase()}-${label}`;
  };
  const addStub = (
    importer: ObjectModule,
    external: { module: string; label: string; line: number },
  ) => {
    const key = stubKey(importer, external.module, external.label);
    if (!stubs.some((other) => other.key === key))
      stubs.push({
        key,
        name: `${external.module.toUpperCase()}-${external.label}`,
        file: importer.file,
        line: external.line,
      });
  };

  // Collect the link set: the entry file, then the modules each one imports,
  // breadth-first in the order of their .EXTERNAL lines.
  const linkSet = [entry];
  // The loop also visits modules pushed while it runs.
  for (const importer of linkSet) {
    for (const external of importer.externals.values()) {
      const target = findModule(importer, external.module);
      if (!target) {
        if (options.stubMissing) addStub(importer, external);
        else
          error(
            importer.file,
            external.line,
            `No module named ${external.module} in this program`,
          );
        continue;
      }
      if (target === entry) {
        error(
          importer.file,
          external.line,
          `Modules can't import from the entry file ${entry.file}`,
        );
        continue;
      }
      if (!target.symbols.has(external.label)) {
        if (options.stubMissing) addStub(importer, external);
        else
          error(
            importer.file,
            external.line,
            `${target.file} has no label ${external.label}`,
          );
      }
      if (!linkSet.includes(target)) linkSet.push(target);
    }
  }
  const diagnostics: Array<Diagnostic> = linkSet.flatMap(
    (module) => module.diagnostics,
  );

  // Place: the entry at its origin, then each module right after the last.
  const bases = new Map<ObjectModule, number>();
  const base = entry.origin ?? DEFAULT_ORIGIN;
  bases.set(entry, base);
  let next = base + entry.words.length;
  for (const module of linkSet.slice(1)) {
    bases.set(module, next);
    next += module.words.length;
  }
  // Stubs go after the last module, one word each.
  const stubBase = next;
  next += stubs.length;
  // The entry may wrap past xFFFF as a single file always could; modules
  // packed after it must fit in user memory.
  if ((linkSet.length > 1 || stubs.length > 0) && next - 1 > USER_END)
    error(
      null,
      null,
      `The program doesn't fit in user memory (ends at ${hex(next - 1)}, limit ${hex(USER_END)})`,
    );
  if (errors.length)
    return { ok: false, diagnostics: [...diagnostics, ...errors] };

  /** The final address of an imported label, once modules are placed. */
  const addressOf = (importer: ObjectModule, name: string) => {
    const { module, label } = splitQualifiedName(name);
    const target = findModule(importer, module);
    const offset = target?.symbols.get(label);
    if (target && offset !== undefined)
      return (bases.get(target)! + offset) & 0xffff;
    const key = stubKey(importer, module, label);
    const index = stubs.findIndex((other) => other.key === key);
    return index < 0 ? undefined : (stubBase + index) & 0xffff;
  };

  const segments: Array<Segment> = [];
  const symbols = new Map<string, number>();
  const sourceMap = new Map<number, SourceLocation>();
  const map: Array<LinkMapEntry> = [];
  for (const module of linkSet) {
    const origin = bases.get(module)!;
    const isEntry = module === entry;
    const words = [...module.words];
    for (const relocation of module.relocations) {
      if (relocation.kind === "local-abs16") {
        words[relocation.offset] = (words[relocation.offset] + origin) & 0xffff;
        continue;
      }
      // Every import was checked above, so the target exists.
      const target = addressOf(module, relocation.external)!;
      if (relocation.kind === "abs16") {
        words[relocation.offset] = target;
        continue;
      }
      const bits = relocation.kind === "pc9" ? 9 : 11;
      const reach = 1 << (bits - 1);
      const pc = origin + relocation.offset + 1;
      const distance = target - pc;
      const word = words[relocation.offset];
      if (distance < -reach || distance >= reach) {
        const name = mnemonic(word);
        error(
          module.file,
          relocation.line,
          `${name} ${relocation.external}: target ${hex(target)} is ${Math.abs(distance)} words away, ${name} reaches ±${reach}. ${advice(name)}`,
        );
        continue;
      }
      words[relocation.offset] = word | (distance & ((1 << bits) - 1));
    }
    segments.push({ origin, words, file: module.file });

    const moduleSymbols = [...module.symbols]
      .map(([label, offset]) => ({
        name: displayName(module, label, isEntry),
        addr: (origin + offset) & 0xffff,
      }))
      .sort((a, b) => a.addr - b.addr);
    for (const { name, addr } of moduleSymbols) symbols.set(name, addr);
    for (const [offset, line] of module.sourceMap)
      sourceMap.set((origin + offset) & 0xffff, { file: module.file, line });
    map.push({
      file: module.file,
      module: module.name,
      start: origin,
      end: (origin + module.words.length - 1) & 0xffff,
      symbols: moduleSymbols,
    });
  }

  if (stubs.length > 0) {
    const stubSymbols = stubs.map((stub, i) => ({
      name: stub.name,
      addr: (stubBase + i) & 0xffff,
    }));
    segments.push({
      origin: stubBase,
      words: stubs.map(() => RET),
      file: STUBS_FILE,
    });
    for (const { name, addr } of stubSymbols) symbols.set(name, addr);
    map.push({
      file: STUBS_FILE,
      module: STUBS_FILE,
      start: stubBase,
      end: (stubBase + stubs.length - 1) & 0xffff,
      symbols: stubSymbols,
    });
    for (const [i, stub] of stubs.entries())
      diagnostics.push({
        file: stub.file,
        position: { line: stub.line },
        severity: "warning",
        text: `${stub.name} is missing: calls to it return at once (RET stub at ${hex(stubBase + i)})`,
      });
  }

  for (const [a, b] of overlappingSegments(segments)) {
    const range = (segment: Segment) =>
      `${hex(segment.origin)}–${hex((segment.origin + segment.words.length - 1) & 0xffff)}`;
    error(
      null,
      null,
      `${a.file} (${range(a)}) overlaps ${b.file} (${range(b)})`,
    );
  }
  if (errors.length)
    return { ok: false, diagnostics: [...diagnostics, ...errors] };

  const image: LinkedImage = { entry: base, segments, symbols, sourceMap, map };
  return { ok: true, image, diagnostics };
}
