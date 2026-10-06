import type { BusAccess } from "./bus";
import type { StepEvent } from "./events";
import type { MachineState } from "./state";

export type BreakpointId = string;
export type WatchId = string;
export type PauseReason =
  | "breakpoint"
  | "watchpoint"
  | "step-complete"
  | "halted"
  | "exception"
  | "user-pause"
  | "waiting-for-input";
export type Breakpoint = {
  id: BreakpointId;
  addr: number;
  enabled: boolean;
  condition?: string;
  hitCount?: number;
  hits: number;
};
export type WatchKind = "read" | "write" | "rw";
export type Watchpoint = {
  id: WatchId;
  addr: number;
  kind: WatchKind;
};
export type DebuggerCheckpoint = {
  depth: number;
  hits: Array<[BreakpointId, number]>;
  poll?: PollRecord;
};
/** Machine state after an empty KBSR read. Records are replaced, never mutated. */
type PollRecord = {
  addr: number;
  regs: ReadonlyArray<number>;
  psr: number;
};
type Mode =
  | { kind: "over"; addr: number; depth: number }
  | { kind: "out"; depth: number }
  | { kind: "address"; addr: number };
type Condition = (state: MachineState) => number;

// A small expression parser, with no eval or access to host JavaScript.
export function compileCondition(text: string): Condition {
  const tokens: Array<string> = [];
  const pattern =
    /\s*(x[0-9a-f]+|#?\d+|R[0-7]|PC|IR|PSR|MCR|N|Z|P|==|!=|<=|>=|&&|\|\||[()!<>+\-&|])/iy;
  let position = 0;
  while (position < text.trimEnd().length) {
    pattern.lastIndex = position;
    const match = pattern.exec(text);
    if (!match) throw new SyntaxError("Invalid breakpoint condition");
    tokens.push(match[1].toUpperCase());
    position = pattern.lastIndex;
  }
  let current = 0;
  const levels: Array<Array<string>> = [
    ["||"],
    ["&&"],
    ["|"],
    ["&"],
    ["==", "!="],
    ["<", ">", "<=", ">="],
    ["+", "-"],
  ];
  const apply = (op: string, a: number, b: number): number => {
    switch (op) {
      case "||":
        return Number(Boolean(a || b));
      case "&&":
        return Number(Boolean(a && b));
      case "|":
        return a | b;
      case "&":
        return a & b;
      case "==":
        return Number(a === b);
      case "!=":
        return Number(a !== b);
      case "<":
        return Number(a < b);
      case ">":
        return Number(a > b);
      case "<=":
        return Number(a <= b);
      case ">=":
        return Number(a >= b);
      case "+":
        return a + b;
      case "-":
        return a - b;
      default:
        throw new SyntaxError("Invalid operator");
    }
  };
  const expression = (level = 0): Condition => {
    if (level === levels.length) {
      const token = tokens[current++];
      if (token === "!" || token === "-" || token === "+") {
        const operand = expression(level);
        return (s) =>
          token === "!"
            ? Number(!operand(s))
            : token === "-"
              ? -operand(s)
              : operand(s);
      }
      if (token === "(") {
        const inner = expression();
        if (tokens[current++] !== ")")
          throw new SyntaxError("Missing closing parenthesis");
        return inner;
      }
      if (!token) throw new SyntaxError("Missing operand");
      if (/^X[0-9A-F]+$/.test(token))
        return () => Number.parseInt(token.slice(1), 16);
      if (/^#?\d+$/.test(token)) return () => Number(token.replace("#", ""));
      if (/^R[0-7]$/.test(token)) return (s) => s.regs[Number(token[1])];
      if (["PC", "IR", "PSR", "MCR"].includes(token))
        return (s) => s[token.toLowerCase() as "pc" | "ir" | "psr" | "mcr"];
      const flag = { N: 4, Z: 2, P: 1 }[token as "N" | "Z" | "P"];
      if (flag) return (s) => Number(Boolean(s.psr & flag));
      throw new SyntaxError("Invalid operand");
    }
    let left = expression(level + 1);
    while (levels[level].includes(tokens[current])) {
      const op = tokens[current++],
        before = left,
        right = expression(level + 1);
      left = (s) => apply(op, before(s), right(s));
    }
    return left;
  };
  const result = expression();
  if (current !== tokens.length)
    throw new SyntaxError("Unexpected token in condition");
  return result;
}

export class Debugger {
  private nextId = 1;
  private readonly points = new Map<
    BreakpointId,
    Breakpoint & { test?: Condition }
  >();
  private readonly watches = new Map<WatchId, Watchpoint>();
  private skipAddress: number | undefined;
  private poll: PollRecord | undefined;
  private mode: Mode | undefined;
  private observing = false;
  private watched = false;
  depth = 0;
  readonly breakpoints = {
    add: (
      addr: number,
      opts: { condition?: string; hitCount?: number } = {},
    ): BreakpointId => {
      if (
        opts.hitCount !== undefined &&
        (!Number.isInteger(opts.hitCount) || opts.hitCount < 1)
      )
        throw new RangeError("Hit count must be a positive integer");
      const test = opts.condition
        ? compileCondition(opts.condition)
        : undefined;
      const id = "b" + this.nextId++;
      this.points.set(id, {
        id,
        addr: addr & 0xffff,
        enabled: true,
        hits: 0,
        ...opts,
        test,
      });
      return id;
    },
    remove: (id: BreakpointId): void => {
      this.points.delete(id);
    },
    toggle: (addr: number): void => {
      const normalized = addr & 0xffff;
      const point = [...this.points.values()].find(
        (p) => p.addr === normalized,
      );
      if (point) point.enabled = !point.enabled;
      else this.breakpoints.add(normalized);
    },
    list: (): ReadonlyArray<Breakpoint> =>
      [...this.points.values()].map(({ test: _test, ...point }) => ({
        ...point,
      })),
  };
  readonly watchpoints = {
    add: (addr: number, kind: WatchKind): WatchId => {
      const id = "w" + this.nextId++;
      this.watches.set(id, { id, addr: addr & 0xffff, kind });
      return id;
    },
    remove: (id: WatchId): void => {
      this.watches.delete(id);
    },
    list: (): ReadonlyArray<Watchpoint> =>
      [...this.watches.values()].map((watch) => ({ ...watch })),
  };
  checkpoint(): DebuggerCheckpoint {
    return {
      depth: this.depth,
      hits: [...this.points].map(([id, point]) => [id, point.hits]),
      poll: this.poll,
    };
  }
  restore(checkpoint: DebuggerCheckpoint): void {
    this.depth = checkpoint.depth;
    this.poll = checkpoint.poll;
    for (const [id, hits] of checkpoint.hits) {
      const point = this.points.get(id);
      if (point) point.hits = hits;
    }
    this.cancelMode();
    this.skipAddress = undefined;
  }
  reset(): void {
    this.depth = 0;
    this.clearPolling();
    this.skipAddress = undefined;
    this.cancelMode();
    for (const point of this.points.values()) point.hits = 0;
  }
  resume(addr: number): void {
    this.skipAddress = addr & 0xffff;
    this.clearPolling();
  }
  clearPolling(): void {
    this.poll = undefined;
  }
  cancelMode(): void {
    this.mode = undefined;
  }
  over(addr: number): void {
    this.mode = { kind: "over", addr: addr & 0xffff, depth: this.depth };
  }
  out(): void {
    this.mode = { kind: "out", depth: this.depth };
  }
  runTo(addr: number): void {
    this.mode = { kind: "address", addr: addr & 0xffff };
  }
  before(state: MachineState): PauseReason | undefined {
    const skip = this.skipAddress === state.pc;
    this.skipAddress = undefined;
    if (skip) return undefined;
    if (this.mode?.kind === "address" && state.pc === this.mode.addr) {
      this.cancelMode();
      return "step-complete";
    }
    let stopped = false;
    for (const point of this.points.values()) {
      if (
        !point.enabled ||
        point.addr !== state.pc ||
        (point.test && !point.test(state))
      )
        continue;
      point.hits++;
      if (point.hits >= (point.hitCount ?? 1)) stopped = true;
    }
    return stopped ? "breakpoint" : undefined;
  }
  beginStep(): void {
    this.observing = true;
    this.watched = false;
  }
  access(access: BusAccess): void {
    if (
      this.observing &&
      [...this.watches.values()].some(
        (watch) =>
          watch.addr === access.addr &&
          (watch.kind === "rw" || watch.kind === access.kind),
      )
    )
      this.watched = true;
  }
  after(event: StepEvent, state: MachineState): PauseReason | undefined {
    this.observing = false;
    if (event.interrupt !== undefined || event.exception) this.depth++;
    else if (event.flow === "call") this.depth++;
    else if (event.flow === "return") this.depth--;
    const waiting = this.checkPolling(event, state);
    if (event.exception) return "exception";
    if (event.halted) return "halted";
    if (this.watched) return "watchpoint";
    if (waiting) return "waiting-for-input";
    if (
      (this.mode?.kind === "over" &&
        event.stateAfter.pc === this.mode.addr &&
        this.depth === this.mode.depth) ||
      (this.mode?.kind === "out" && this.depth < this.mode.depth)
    ) {
      this.cancelMode();
      return "step-complete";
    }
    return undefined;
  }
  // Registers and flags may change between two empty status reads, as long as
  // they match again at the second read. Anything with an effect outside the
  // registers counts as work and discards the record.
  private checkPolling(event: StepEvent, state: MachineState): boolean {
    if (
      event.exception ||
      event.interrupt !== undefined ||
      event.flow ||
      event.halted ||
      event.stateAfter.keyboard.buffer.length ||
      event.memWrites.length ||
      event.output
    ) {
      this.clearPolling();
      return false;
    }
    if (!event.stateAfter.keyboard.waiting) return false;
    const previous = this.poll;
    this.poll = {
      addr: event.pc,
      regs: Array.from(state.regs),
      psr: state.psr,
    };
    return (
      previous !== undefined &&
      previous.addr === event.pc &&
      previous.psr === state.psr &&
      previous.regs.every((value, i) => value === state.regs[i])
    );
  }
}
