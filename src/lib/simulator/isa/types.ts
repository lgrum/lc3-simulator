export type CpuException = "privilege" | "illegal-opcode" | "access-violation";

export type DisassemblyContext = {
  /** Address of the instruction word, before the fetch increment. */
  pc: number;
  symbols: ReadonlyMap<number, string>;
};

export type Cpu = {
  reg: (n: number) => number;
  setReg: (n: number, value: number) => void; // records the change for the UI and history
  setCC: (value: number) => void;
  pc: number;
  psr: number;
  read: (addr: number) => number; // goes through the bus, so watchpoints and devices work
  write: (addr: number, value: number) => void;
  trap: (vector: number) => void;
  returnFromInterrupt: () => void;
  /** Initiates the exception and aborts the current instruction. */
  raise: (exception: CpuException) => never;
};

export type InstructionSpec<F = unknown> = {
  mnemonic: string;
  opcode: number; // bits [15:12]
  // Selects opcode variants. Fixed unused bits are ignored by the LC-3 datapath.
  match?: (word: number) => boolean;
  decode: (word: number) => F;
  execute: (cpu: Cpu, fields: F) => void;
  disassemble: (fields: F, ctx: DisassemblyContext) => string;
  /** Used by the debugger; the CPU does not identify calls by opcode or name. */
  flow?: "call" | "return";
};

export type IsaDefinition = {
  name: string;
  instructions: ReadonlyArray<InstructionSpec<any>>;
  memoryMap: { userStart: number; userEnd: number; mmioStart: number };
};
