import { CircleDashedIcon } from "lucide-react";

import { m } from "@/paraglide/messages";

import { HintedKey } from "../ui/key";
import { useAccount, useAssembly, useWorkbench } from "../workbench-provider";

/**
 * Admins only: build with RET stubs in place of modules nobody has
 * published yet, so main runs before every group is done.
 */
export function StubToggle() {
  const { assembly } = useWorkbench();
  const { viewer } = useAccount();
  const { stubMissing } = useAssembly();
  if (viewer?.kind !== "admin") return null;
  return (
    <HintedKey
      tone="flat"
      aria-pressed={stubMissing}
      hint={m.stub_missing_hint()}
      onClick={() => void assembly.setStubMissing(!stubMissing)}
      className="aria-pressed:bg-phosphor/15 aria-pressed:text-phosphor"
    >
      <CircleDashedIcon aria-hidden />
      {m.stub_missing()}
    </HintedKey>
  );
}
