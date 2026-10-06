import type { Bus } from "./bus";
import type { DebuggerCheckpoint } from "./debugger";
import type { StepEvent } from "./events";
import { restoreControl } from "./state";
import type { MachineState } from "./state";

type Entry = { event: StepEvent; debuggerBefore: DebuggerCheckpoint };
export class History {
  private readonly entries: Array<Entry | undefined>;
  private head = 0;
  private size = 0;
  constructor(readonly capacity = 4096) {
    if (!Number.isInteger(capacity) || capacity < 1)
      throw new RangeError("History capacity must be a positive integer");
    this.entries = Array.from({ length: capacity });
  }
  push(event: StepEvent, debuggerBefore: DebuggerCheckpoint): void {
    this.entries[this.head] = { event, debuggerBefore };
    this.head = (this.head + 1) % this.capacity;
    this.size = Math.min(this.capacity, this.size + 1);
  }
  clear(): void {
    this.entries.fill(undefined);
    this.head = 0;
    this.size = 0;
  }
  trace(limit: number): ReadonlyArray<StepEvent> {
    const count = Math.min(this.size, Math.max(0, Math.floor(limit)));
    return Array.from(
      { length: count },
      (_, i) =>
        this.entries[(this.head - count + i + this.capacity) % this.capacity]
          ?.event,
    ).filter((event): event is StepEvent => !!event);
  }
  undo(state: MachineState, bus: Bus): Entry | null {
    if (!this.size) return null;
    this.head = (this.head - 1 + this.capacity) % this.capacity;
    this.size--;
    const entry = this.entries[this.head];
    this.entries[this.head] = undefined;
    if (!entry) throw new Error("Missing history entry");
    for (const write of entry.event.memWrites.slice().reverse())
      bus.restore(write.addr, write.before);
    for (const write of entry.event.regWrites.slice().reverse())
      state.regs[write.reg] = write.before;
    restoreControl(state, entry.event.stateBefore);
    return entry;
  }
}
