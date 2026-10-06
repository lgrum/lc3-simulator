import type { Bus } from "../bus";
import type { MachineState } from "../state";

export class Keyboard {
  constructor(
    private readonly state: MachineState,
    bus: Bus,
  ) {
    bus.onStepStart(() => {
      state.keyboard.waiting = false;
    });
    bus.mapDevice(0xfe00, {
      read: () => {
        state.keyboard.waiting = !this.ready;
        return this.status;
      },
      peek: () => this.status,
      write: (_address, value) => {
        state.keyboard.status = value & 0x4000;
      },
    });
    bus.mapDevice(0xfe02, {
      read: () => {
        const keyboard = state.keyboard;
        if (keyboard.buffer.length)
          keyboard.data = keyboard.buffer.shift() ?? 0;
        keyboard.waiting = false;
        return keyboard.data;
      },
      peek: () => state.keyboard.buffer[0] ?? state.keyboard.data,
      write: () => undefined,
    });
    bus.addInterruptSource(() =>
      (this.status & 0xc000) === 0xc000
        ? { vector: 0x80, priority: 4 }
        : undefined,
    );
  }
  get ready(): boolean {
    return this.state.keyboard.buffer.length > 0;
  }
  get status(): number {
    return this.state.keyboard.status | (this.ready ? 0x8000 : 0);
  }
  input(chars: string): void {
    for (const char of chars)
      this.state.keyboard.buffer.push((char.codePointAt(0) ?? 0) & 0xff);
    if (this.ready) this.state.keyboard.waiting = false;
  }
}
