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

/**
 * Whether a step ran an instruction of the user's program: one fetched in
 * user mode. A TRAP counts; the OS code it runs, in supervisor mode, and
 * interrupt or fault entries don't.
 */
export function isUserInstruction(event: StepEvent): boolean {
  return (
    event.word !== null &&
    event.interrupt === undefined &&
    (event.psrBefore & 0x8000) !== 0
  );
}
