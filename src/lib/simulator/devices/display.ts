import type { Bus } from "../bus";
import type { MachineState } from "../state";

export function installDisplay(bus: Bus, state: MachineState): void {
  bus.mapDevice(0xfe04, {
    read: () => state.display.status,
    peek: () => state.display.status,
    write: () => undefined,
  });
  bus.mapDevice(0xfe06, {
    read: () => state.display.data,
    peek: () => state.display.data,
    write: (_address, value) => {
      state.display.data = value & 0xff;
      const char = String.fromCharCode(state.display.data);
      state.display.output += char;
      bus.emitOutput(char);
    },
  });
}
