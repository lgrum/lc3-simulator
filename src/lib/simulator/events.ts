import type { CpuException } from "./isa/types";
import type { ControlState } from "./state";

export type StepEvent = {
  pc: number;
  /** Null for an interrupt or a fault before instruction fetch. */
  word: number | null;
  mnemonic: string;
  regWrites: Array<{ reg: number; before: number; after: number }>;
  memWrites: Array<{ addr: number; before: number; after: number }>;
  psrBefore: number;
  psrAfter: number;
  output?: string;
  halted?: boolean;
  exception?: CpuException;
  interrupt?: number;
  flow?: "call" | "return";
  /** Small records for undo; RAM is not copied. */
  stateBefore: ControlState;
  stateAfter: ControlState;
};
