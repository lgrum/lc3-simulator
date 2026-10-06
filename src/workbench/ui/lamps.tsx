import { cn } from "@/lib/utils";

const GROUPS = [0, 1, 2, 3];
const BITS = [3, 2, 1, 0];

/** The 16 bits of a word as lamps, most significant first, in nibbles. */
export function Lamps({ value }: { value: number }) {
  return (
    <span aria-hidden className="flex">
      {GROUPS.map((group) => (
        <span
          key={group}
          className="flex gap-[3px] px-1 not-first:border-l not-first:border-edge-2"
        >
          {BITS.map((bit) => {
            const on = (value >>> ((3 - group) * 4 + bit)) & 1;
            return (
              <span
                key={bit}
                className={cn(
                  "size-2.5 rounded-full",
                  on
                    ? "bg-[radial-gradient(circle_at_40%_35%,#ffc0a8,var(--lamp)_55%)] shadow-[0_0_6px_rgba(255,90,54,0.65)]"
                    : "bg-lamp-off shadow-[inset_0_1px_1px_rgba(0,0,0,0.6)]",
                )}
              />
            );
          })}
        </span>
      ))}
    </span>
  );
}
