export type MachineState = {
  memory: Uint16Array;
  regs: Uint16Array;
  pc: number;
  ir: number;
  psr: number;
  mcr: number;
  savedUSP: number;
  savedSSP: number;
  keyboard: {
    buffer: Array<number>;
    status: number;
    data: number;
    /** An empty KBSR read in the current CPU step, not a persistent wait state. */
    waiting: boolean;
  };
  display: { status: number; data: number; output: string };
};
export type ControlState = Omit<MachineState, "memory" | "regs">;
export function createMachineState(): MachineState {
  const regs = new Uint16Array(8);
  regs[6] = 0x3000;
  return {
    memory: new Uint16Array(0x10000),
    regs,
    pc: 0,
    ir: 0,
    psr: 2,
    mcr: 0x8000,
    savedUSP: 0xfdff,
    savedSSP: 0x3000,
    keyboard: { buffer: [], status: 0, data: 0, waiting: false },
    display: { status: 0x8000, data: 0, output: "" },
  };
}
export function captureControl(state: MachineState): ControlState {
  const { memory: _memory, regs: _regs, ...control } = state;
  return structuredClone(control);
}
export function restoreControl(
  state: MachineState,
  control: ControlState,
): void {
  Object.assign(state, structuredClone(control));
}
