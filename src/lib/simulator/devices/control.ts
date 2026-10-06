import type { Bus } from "../bus";
import type { MachineState } from "../state";

export function installControlDevices(bus: Bus, state: MachineState): void {
  for (const [address, field] of [
    [0xfffc, "psr"],
    [0xfffe, "mcr"],
  ] as const) {
    const read = () => state[field];
    const write = (_address: number, value: number) => {
      state[field] = value & 0xffff;
    };
    bus.mapDevice(address, { read, write, peek: read, restore: write });
  }
}
