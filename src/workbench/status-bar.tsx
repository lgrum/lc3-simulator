import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip";
import { THEME_PREFERENCES, setThemePreference, useTheme } from "@/lib/theme";
import type { ThemePreference } from "@/lib/theme";
import { m } from "@/paraglide/messages";

import { cn } from "@/lib/utils";

import { useSnapshot } from "./workbench-provider";

const THEMES: Record<
  ThemePreference,
  { icon: LucideIcon; label: () => string }
> = {
  system: { icon: MonitorIcon, label: m.theme_system },
  light: { icon: SunIcon, label: m.theme_light },
  dark: { icon: MoonIcon, label: m.theme_dark },
};

function ThemeSwitch() {
  const { preference } = useTheme();
  return (
    <div
      role="group"
      aria-label={m.status_theme()}
      className="flex items-center gap-0.5"
    >
      {THEME_PREFERENCES.map((option) => {
        const { icon: Icon, label } = THEMES[option];
        return (
          <Tooltip key={option}>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label={label()}
                  aria-pressed={option === preference}
                  onClick={() => setThemePreference(option)}
                  className={cn(
                    "grid size-5 place-items-center rounded-[3px] outline-none hover:text-silk focus-visible:ring-2 focus-visible:ring-phosphor/70",
                    option === preference ? "text-silk" : "text-silk-3",
                  )}
                />
              }
            >
              <Icon aria-hidden className="size-3.5" />
            </TooltipTrigger>
            <TooltipPopup>{label()}</TooltipPopup>
          </Tooltip>
        );
      })}
    </div>
  );
}

export function StatusBar() {
  const { privilege } = useSnapshot();
  return (
    <footer className="flex items-center gap-5 border-t border-seam bg-status px-3.5 text-xs text-silk-2">
      <span>{m.status_isa()}</span>
      <span>
        {privilege === "user"
          ? m.status_mode_user()
          : m.status_mode_supervisor()}
      </span>
      <span className="ml-auto flex items-center gap-4">
        <ThemeSwitch />
      </span>
    </footer>
  );
}
