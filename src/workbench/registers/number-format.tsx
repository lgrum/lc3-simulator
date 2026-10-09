import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";

import {
  Menu,
  MenuGroupLabel,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { m } from "@/paraglide/messages";

import { MAX_FRACTION_BITS } from "../lib/format";
import { Key } from "../ui/key";

const STORAGE_KEY = "lc3sim.fractionBits";
const FORMATS = Array.from({ length: MAX_FRACTION_BITS + 1 }, (_, n) => n);

function readFractionBits(): number {
  try {
    const stored = Number(localStorage.getItem(STORAGE_KEY));
    return FORMATS.includes(stored) ? stored : 0;
  } catch {
    return 0;
  }
}

/** How R0–R7 are read as numbers: the Qn format, saved between visits. */
export function useFractionBits() {
  const [fractionBits, setState] = useState(readFractionBits);
  const setFractionBits = (next: number) => {
    setState(next);
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // Not saved, but still used for this visit.
    }
  };
  return [fractionBits, setFractionBits] as const;
}

export function NumberFormatMenu({
  fractionBits,
  onChange,
}: {
  fractionBits: number;
  onChange: (fractionBits: number) => void;
}) {
  return (
    <Menu>
      <MenuTrigger
        render={
          <Key
            tone="flat"
            aria-label={`${m.number_format()}: Q${fractionBits}`}
            className="h-6 px-1.5"
          />
        }
      >
        <span className="font-mono text-[11.5px] text-phosphor">
          Q{fractionBits}
        </span>
        <ChevronDownIcon aria-hidden />
      </MenuTrigger>
      <MenuPopup align="end">
        <MenuRadioGroup
          value={String(fractionBits)}
          onValueChange={(value: string) => onChange(Number(value))}
        >
          {/* Base UI requires group labels inside their group. */}
          <MenuGroupLabel>{m.number_format_label()}</MenuGroupLabel>
          <MenuSeparator />
          {FORMATS.map((n) => (
            <MenuRadioItem
              key={n}
              value={String(n)}
              closeOnClick
              className="font-mono"
            >
              {n === 0 ? m.number_format_integer({ q: "Q0" }) : `Q${n}`}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuPopup>
    </Menu>
  );
}
