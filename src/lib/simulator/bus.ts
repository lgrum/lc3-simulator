import type { IsaDefinition } from "./isa/types";

export type MemoryBus = {
  read: (address: number) => number;
  write: (address: number, value: number) => void;
  /** Read without side effects. */
  peek?: (address: number) => number;
  restore?: (address: number, value: number) => void;
};
export type BusAccess = { addr: number; kind: "read" | "write"; value: number };
export type MemoryWrite = { addr: number; before: number; after: number };
export type InterruptRequest = { vector: number; priority: number };
export class Bus implements MemoryBus {
  private readonly devices = new Map<number, MemoryBus>();
  private readonly listeners = new Set<(access: BusAccess) => void>();
  private readonly stepListeners = new Set<() => void>();
  private readonly interruptSources = new Set<
    () => InterruptRequest | undefined
  >();
  private guard: ((address: number) => void) | undefined;
  private writes: Array<MemoryWrite> | undefined;
  private output = "";
  constructor(readonly memory: Uint16Array = new Uint16Array(0x10000)) {
    if (memory.length !== 0x10000)
      throw new RangeError("LC-3 memory must contain 65,536 words");
  }
  configureProtection(
    map: IsaDefinition["memoryMap"],
    psr: () => number,
    fault: () => never,
    strict = true,
  ): void {
    this.guard = strict
      ? (address) => {
          if (
            psr() & 0x8000 &&
            (address < map.userStart ||
              address > map.userEnd ||
              address >= map.mmioStart)
          )
            fault();
        }
      : undefined;
  }
  mapDevice(address: number, device: MemoryBus): void {
    this.devices.set(address & 0xffff, device);
  }
  onAccess(listener: (access: BusAccess) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  onStepStart(listener: () => void): () => void {
    this.stepListeners.add(listener);
    return () => this.stepListeners.delete(listener);
  }
  addInterruptSource(source: () => InterruptRequest | undefined): void {
    this.interruptSources.add(source);
  }
  pendingInterrupt(priority: number): InterruptRequest | undefined {
    let pending: InterruptRequest | undefined;
    for (const source of this.interruptSources) {
      const request = source();
      if (
        request &&
        request.priority > priority &&
        (!pending || request.priority > pending.priority)
      )
        pending = request;
    }
    return pending;
  }
  beginStep(): void {
    this.writes = [];
    this.output = "";
    for (const listener of this.stepListeners) listener();
  }
  endStep(): { memWrites: Array<MemoryWrite>; output?: string } {
    const result = {
      memWrites: this.writes ?? [],
      ...(this.output ? { output: this.output } : {}),
    };
    this.writes = undefined;
    this.output = "";
    return result;
  }
  emitOutput(chars: string): void {
    this.output += chars;
  }
  /** Update the RAM view of device registers without consuming input. */
  refreshDevices(start: number, count: number): void {
    for (const [address, device] of this.devices) {
      if (address >= start && address < start + count && device.peek)
        this.memory[address] = device.peek(address) & 0xffff;
    }
  }
  peek(address: number): number {
    const normalized = address & 0xffff;
    return (
      (this.devices.get(normalized)?.peek?.(normalized) ??
        this.memory[normalized]) & 0xffff
    );
  }
  read(address: number): number {
    const normalized = address & 0xffff;
    this.guard?.(normalized);
    const device = this.devices.get(normalized);
    const value =
      (device ? device.read(normalized) : this.memory[normalized]) & 0xffff;
    for (const listener of this.listeners)
      listener({ addr: normalized, kind: "read", value });
    return value;
  }
  write(address: number, value: number): void {
    const normalized = address & 0xffff;
    const word = value & 0xffff;
    this.guard?.(normalized);
    const before = this.peek(normalized);
    const device = this.devices.get(normalized);
    if (device) device.write(normalized, word);
    else this.memory[normalized] = word;
    const after = device?.peek ? device.peek(normalized) & 0xffff : word;
    this.writes?.push({ addr: normalized, before, after });
    for (const listener of this.listeners)
      listener({ addr: normalized, kind: "write", value: word });
  }
  /** Undo without issuing I/O or watchpoint events. Plain device state is restored separately. */
  restore(address: number, value: number): void {
    const device = this.devices.get(address & 0xffff);
    if (device) device.restore?.(address & 0xffff, value & 0xffff);
    else this.memory[address & 0xffff] = value & 0xffff;
  }
}
