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
                    ? "bg-[radial-gradient(circle_at_40%_35%,var(--lamp-hi),var(--lamp)_55%)] shadow-[0_0_6px_var(--lamp-glow)]"
                    : "bg-lamp-off shadow-[inset_0_1px_1px_var(--well-inset)]",
                )}
              />
            );
          })}
        </span>
      ))}
    </span>
  );
}
