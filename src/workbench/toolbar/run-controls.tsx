import {
  ArrowDownToLineIcon,
  ArrowUpFromLineIcon,
  ChevronDownIcon,
  PauseIcon,
  PlayIcon,
  Redo2Icon,
  RotateCcwIcon,
  TextCursorIcon,
  Undo2Icon,
} from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";

import {
  Menu,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { m } from "@/paraglide/messages";

import {
  availableControls,
  continueRun,
  pause,
  reset,
  runToCursor,
  stepBack,
  stepInto,
  stepOut,
  stepOver,
} from "../actions";
import { HintedKey, Key, Shortcut } from "../ui/key";
import { useSnapshot, useWorkbench } from "../workbench-provider";
import type { Workbench } from "../workbench-provider";

/** A label that collapses to the icon on narrow screens but stays readable. */
function Label({ children }: { children: ReactNode }) {
  return <span className="max-[1360px]:sr-only">{children}</span>;
}

function Hint({ text, keys }: { text: string; keys?: string }) {
  return (
    <>
      {text}
      {keys && (
        <>
          {" "}
          <Shortcut>{keys}</Shortcut>
        </>
      )}
    </>
  );
}

type ControlProps = {
  icon: ReactNode;
  label: string;
  hint?: string;
  keys?: string;
  enabled: boolean;
  onRun: (workbench: Workbench) => void;
  iconOnly?: boolean;
};

function Control({
  icon,
  label,
  hint,
  keys,
  enabled,
  onRun,
  iconOnly,
}: ControlProps) {
  const workbench = useWorkbench();
  return (
    <HintedKey
      hint={<Hint text={hint ?? label} keys={keys} />}
      aria-label={iconOnly ? label : undefined}
      aria-keyshortcuts={keys}
      disabled={!enabled}
      onClick={() => onRun(workbench)}
    >
      {icon}
      {!iconOnly && <Label>{label}</Label>}
    </HintedKey>
  );
}

function ResetControl() {
  const workbench = useWorkbench();
  return (
    <span className="flex">
      <HintedKey
        hint={m.reset_hint()}
        className="rounded-r-none"
        onClick={() => reset(workbench)}
      >
        <RotateCcwIcon aria-hidden />
        <Label>{m.reset()}</Label>
      </HintedKey>
      <Menu>
        <MenuTrigger
          render={
            <Key
              className="rounded-l-none border-l-0 px-1.5"
              aria-label={m.reset_options()}
            />
          }
        >
          <ChevronDownIcon aria-hidden />
        </MenuTrigger>
        <MenuPopup align="end">
          <MenuItem onClick={() => reset(workbench)}>
            {m.reset_reload()}
          </MenuItem>
          <MenuItem onClick={() => reset(workbench, { keepMemory: true })}>
            {m.reset_keep_memory()}
          </MenuItem>
        </MenuPopup>
      </Menu>
    </span>
  );
}

const SPEEDS = ["1", "10", "100", "1000", "10000", "max"] as const;
type Speed = (typeof SPEEDS)[number];

function speedLabel(speed: Speed): string {
  if (speed === "max") return m.speed_max();
  return m.speed_per_second({ count: Number(speed).toLocaleString() });
}

function SpeedControl() {
  const { machine } = useWorkbench();
  const [speed, setSpeed] = useState<Speed>("max");
  return (
    <Menu>
      <MenuTrigger render={<Key tone="flat" />}>
        <span className="text-silk-2">{m.speed()}</span>
        <span className="font-mono text-[11.5px] text-phosphor">
          {speed === "max" ? m.speed_max() : Number(speed).toLocaleString()}
        </span>
        <ChevronDownIcon aria-hidden />
      </MenuTrigger>
      <MenuPopup align="end">
        <MenuGroupLabel>{m.speed_label()}</MenuGroupLabel>
        <MenuSeparator />
        <MenuRadioGroup
          value={speed}
          onValueChange={(value: Speed) => {
            setSpeed(value);
            machine.setSpeed(value === "max" ? "max" : Number(value));
          }}
        >
          {SPEEDS.map((value) => (
            <MenuRadioItem key={value} value={value}>
              {speedLabel(value)}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuPopup>
    </Menu>
  );
}

export function RunControls() {
  const workbench = useWorkbench();
  const snapshot = useSnapshot();
  const enabled = availableControls(snapshot);
  const halted = snapshot.status === "halted";

  return (
    <div
      role="toolbar"
      aria-label={m.controls_label()}
      className="flex items-center gap-1.5"
    >
      <HintedKey
        tone="run"
        hint={
          <Hint
            text={halted ? m.restart_hint() : m.continue_hint()}
            keys="F5"
          />
        }
        aria-keyshortcuts="F5"
        disabled={!enabled.continue}
        onClick={() => continueRun(workbench)}
      >
        <PlayIcon aria-hidden />
        {halted ? m.restart() : m.continue_run()}
        <Shortcut>F5</Shortcut>
      </HintedKey>
      <Control
        icon={<PauseIcon aria-hidden />}
        label={m.pause()}
        keys="F6"
        enabled={enabled.pause}
        onRun={pause}
      />
      <Control
        icon={<Redo2Icon aria-hidden />}
        label={m.step_over()}
        hint={m.step_over_hint()}
        keys="F10"
        enabled={enabled.step}
        onRun={stepOver}
      />
      <Control
        icon={<ArrowDownToLineIcon aria-hidden />}
        label={m.step_into()}
        hint={m.step_into_hint()}
        keys="F11"
        enabled={enabled.step}
        onRun={stepInto}
      />
      <Control
        icon={<ArrowUpFromLineIcon aria-hidden />}
        label={m.step_out()}
        hint={m.step_out_hint()}
        keys="Shift+F11"
        enabled={enabled.step}
        onRun={stepOut}
      />
      <Control
        icon={<Undo2Icon aria-hidden />}
        label={m.step_back()}
        hint={m.step_back_hint()}
        enabled={enabled.stepBack}
        onRun={stepBack}
      />
      <Control
        icon={<TextCursorIcon aria-hidden />}
        label={m.run_to_cursor()}
        hint={m.run_to_cursor_hint()}
        keys="Ctrl+F10"
        enabled={enabled.runToCursor}
        onRun={runToCursor}
        iconOnly
      />
      <ResetControl />
      <SpeedControl />
    </div>
  );
}
