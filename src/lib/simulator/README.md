# Headless LC-3 engine

The engine follows the Patt/Patel third-edition LC-3 ISA. TRAP saves PC and PSR on the supervisor stack. OS services return with RTI. R7 is used for JSR/JSRR, not TRAP. LEA preserves condition codes. See [Appendix A](https://icourse.club/uploads/files/a9710bf2454961912f79d89b25ba33c4841f6c24.pdf) and [Appendix C](https://icourse.club/uploads/files/02ad7723e96542e578dd7714c680630b2301b4ca.pdf).

## Use

```ts
import { assemble } from "../assembler/assembler";
import { tokenize } from "../assembler/lexer";
import { parse } from "../assembler/parser";
import { createMachineController } from "./controller";

const machine = createMachineController();
machine.onOutput((text) => console.log(text));
machine.load(assemble(parse(tokenize(source))));
machine.run();
```

The controller is the public engine API. It has no React dependency. Construction starts no timer. The default scheduler uses requestAnimationFrame in a browser and timers elsewhere. Tests can supply a scheduler with a clock.

The assembler returns `{ origin, words, symbols, sourceMap }`. Words exclude the origin. Each emitted word maps to its instruction or directive line, including block words and string terminators. A program has one .ORIG block; a second block raises an error. Addresses can wrap at xFFFF.

Disassembled words pair `sourceLine` with `source: "program" | "os"`. Use both fields when following the PC. OS lines belong to `os/lc3os.asm`, not the user's file. Words without a source mapping have neither field. Loading a program over an OS word removes that word's OS mapping and OS labels, by address and by name. Program labels win name collisions.

## ISA and state

Pass `{ isa: definition }` to the controller, or pass the definition as the first argument of `new Cpu(definition, state, bus, options)`. The CPU builds 16 dispatch slots. A slot selects only variants of that opcode. It imports no base instruction set.

Each instruction requires disassembly. Optional `flow: "call" | "return"` metadata lets the debugger follow calls in a custom ISA. `returnFromInterrupt()` is part of the CPU facade, since RTI shares stack and privilege state with trap, exception and interrupt entry. The facade has no separate condition-code enum: PSR contains the exact N/Z/P bits.

MachineState is plain data. It includes RAM, registers, PC, IR, PSR, MCR, saved stack pointers, and keyboard/display state. It supports structuredClone. The CPU alone starts in supervisor mode. The controller loads a program in user mode when its origin is in the ISA's user range. Its initial user stack is userEnd, its supervisor stack is userStart, and its initial flags are Z.

Every CPU memory access goes through the bus. PSR at xFFFC and MCR at xFFFE are mapped devices. Strict protection is on by default, including fetch; `strictAccess: false` relaxes memory protection. It does not make user-mode RTI legal.

## OS and devices

The default OS is assembled from [lc3os.asm](os/lc3os.asm) by this project's assembler. The source is imported as a raw text asset by the build tool. A standalone Node loader must handle that asset, or import a bundle built by the tool. No native trap shortcut is used.

All 256 trap vectors and all 256 exception/interrupt vectors have handlers. GETC, OUT, PUTS, IN and PUTSP use memory-mapped devices. HALT prints a message, restores R0–R5 and R7, and clears MCR's clock bit. The final MCR write needs a source register, so it uses the supervisor R6: while halted, R6 holds the stopped MCR value and the program's R6 is in `savedUSP`. A client can show `savedUSP` as the program's R6 while the machine is in supervisor mode. Setting MCR bit 15 again returns to the instruction after HALT. The default fault handler prints a message, keeps R0 and calls HALT; re-enabling the clock after a fault re-executes the faulting instruction. The keyboard ISR at vector x80, priority 4, consumes and echoes a byte, then returns with RTI.

The keyboard retains queued bytes. KBSR bit 15 reflects ready state; bit 14 enables interrupts. Reading KBDR consumes one byte. Inspecting memory does not consume input. Display writes use the low byte, and display readiness is immediate. Pass `os: false` or another assembled image when using a different OS.

## Execution and debugging

run, stepOver, stepOut and runTo use time slices of at most about 8 ms. Subscribers receive one notification per slice. setSpeed accepts a positive instruction rate or "max". An empty KBSR read is recorded for that CPU step only. The debugger stores the address of each empty read with R0–R7 and PSR. Execution waits, just after the read, when the next empty read happens at the same address with the same registers and PSR. Registers and flags may change in between if they return to the same values. Memory writes, output, calls, returns, interrupts, exceptions, HALT or queued input discard the record. A one-time check, or a loop that changes data between checks, does not pause. Input resumes an active run or step mode; it does not resume an explicit user pause or a manual single step.

Breakpoints stop before execution. Every resume skips the breakpoint check at the current address once, including the first run after load, manual steps, undo and edits. Later visits still trigger the breakpoint. Conditions support registers R0–R7, PC, IR, PSR, MCR, N/Z/P, decimal and x-prefixed hexadecimal numbers, parentheses, comparisons, logical operators, bitwise &/|, and addition/subtraction. Expressions cannot access host JavaScript. Hit counts count visits that satisfy the condition; the breakpoint stops at and after the configured count.

Register and control-word values in conditions are unsigned, from 0 to 65535. For a word containing xFFFF, use `R0 == xFFFF`; `R0 == -1` is false. Use `(R0 & x8000) != 0` to test the sign bit; `R0 < 0` is false. N/Z/P evaluate to 0 or 1.

Step over follows the return address and call depth, including recursive calls, traps and interrupts. Watchpoints observe bus reads, including fetch, and writes. They stop after the current instruction. Adding or removing a watchpoint changes snapshot.version and notifies subscribers. Exceptions and HALT take precedence over other pause reasons. Run to address stops before that address executes. When the target is the current PC, execution starts and stops at the next visit to that address.

`stepInto()` returns one StepEvent when the clock is enabled. It throws `Error("Machine clock is stopped")` when MCR bit 15 is clear. It sets the halted pause reason and creates no event in that case. Non-call `stepOver()` uses `stepInto()` and has the same stopped-clock behavior. Undo the HALT step or enable MCR before stepping again.

StepEvent records register writes, bus writes, flags, output, faults and interrupts. A fault before fetch and an interrupt have a null instruction word. Small before/after control records support undo without copying RAM. History is a capped ring, with 4096 entries by default. Undo restores RAM, registers, flags, saved stacks, queued input and display output, as well as debugger depth and hit counts. An output callback cannot retract text already sent to an external console; snapshot.output provides the restored console text.

Register edits, memory edits and new input clear older undo history. reset restores the loaded OS and program; reset with keepMemory retains RAM and resets processor/device state. Breakpoints and watchpoints remain configured across reset. Inspection returns stable snapshots and a RAM view for a contiguous memory window. Treat that view as read-only; use writeMemory for edits. Device registers are refreshed through side-effect-free bus peeks.

## Validation

Run `vp test run` for the assembler, instruction, CPU, controller, device, debugger and undo tests. Run `vp check src/lib/simulator src/lib/assembler` for formatting, lint and type checks. A CLI runner and differential tests against lc3tools remain optional work.
