import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip";
import { THEME_PREFERENCES, setThemePreference, useTheme } from "@/lib/theme";
import type { ThemePreference } from "@/lib/theme";
import { m } from "@/paraglide/messages";
import { getLocale, locales, setLocale } from "@/paraglide/runtime";
import type { Locale } from "@/paraglide/runtime";

import { cn } from "@/lib/utils";

import { useSnapshot } from "./workbench-provider";

const LANGUAGE_NAMES: Record<Locale, string> = {
  en: "English",
  es: "Español",
};

function LanguageSwitch() {
  const current = getLocale();
  return (
    <div
      role="group"
      aria-label={m.status_language()}
      className="flex items-center gap-1"
    >
      {locales.map((locale) => (
        <button
          key={locale}
          type="button"
          lang={locale}
          aria-pressed={locale === current}
          // Paraglide stores the choice and reloads; the program is saved.
          onClick={() => setLocale(locale)}
          className={cn(
            "rounded-[3px] px-1.5 outline-none hover:text-silk focus-visible:ring-2 focus-visible:ring-phosphor/70",
            locale === current ? "text-silk" : "text-silk-3",
          )}
        >
          {LANGUAGE_NAMES[locale]}
        </button>
      ))}
    </div>
  );
}

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
        <LanguageSwitch />
      </span>
    </footer>
  );
}
