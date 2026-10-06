import type {
  MachineController,
  MachineSnapshot,
  RegisterName,
} from "@/lib/simulator/controller";

export type Changes = {
  registers: ReadonlySet<RegisterName>;
  memory: ReadonlySet<number>;
};

type TrackedMachine = Pick<
  MachineController,
  "subscribe" | "getSnapshot" | "readMemory"
>;

const NO_CHANGES: Changes = Object.freeze({
  registers: new Set<RegisterName>(),
  memory: new Set<number>(),
});

function registersOf(
  snapshot: MachineSnapshot,
): Array<readonly [RegisterName, number]> {
  return [
    ...snapshot.regs.map((value, i): readonly [RegisterName, number] => [
      `R${i}` as RegisterName,
      value,
    ]),
    ["PC", snapshot.pc],
    ["IR", snapshot.ir],
    ["PSR", snapshot.psr],
    ["MCR", snapshot.mcr],
    ["USP", snapshot.savedUSP],
    ["SSP", snapshot.savedSSP],
  ];
}

/**
 * Tracks which registers and memory words changed between the last two times
 * the machine stopped: a step, a step back, or the end of a run. Nothing is
 * compared while the machine runs. Compatible with useSyncExternalStore.
 */
export class ChangeTracker {
  private registers = new Map<RegisterName, number>();
  private readonly memory = new Uint16Array(0x10000);
  private changes = NO_CHANGES;
  private version = -1;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly machine: TrackedMachine) {
    this.rebase();
    machine.subscribe(() => this.update());
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getChanges = (): Changes => this.changes;

  /** Forgets earlier state, e.g. after loading a program. */
  rebase(): void {
    const snapshot = this.machine.getSnapshot();
    this.registers = new Map(registersOf(snapshot));
    this.memory.set(this.machine.readMemory(0, 0x10000));
    this.version = snapshot.version;
    this.publish(NO_CHANGES);
  }

  private update(): void {
    const snapshot = this.machine.getSnapshot();
    if (snapshot.status === "running" || snapshot.version === this.version)
      return;
    this.version = snapshot.version;

    const registers = new Set<RegisterName>();
    for (const [name, value] of registersOf(snapshot)) {
      if (this.registers.get(name) !== value) registers.add(name);
      this.registers.set(name, value);
    }
    const memory = new Set<number>();
    const current = this.machine.readMemory(0, 0x10000);
    for (let addr = 0; addr < 0x10000; addr++) {
      if (current[addr] !== this.memory[addr]) memory.add(addr);
    }
    this.memory.set(current);
    this.publish(
      registers.size || memory.size ? { registers, memory } : NO_CHANGES,
    );
  }

  private publish(changes: Changes): void {
    if (changes === this.changes) return;
    this.changes = changes;
    for (const listener of this.listeners) listener();
  }
}
