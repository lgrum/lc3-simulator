import { BookOpenIcon, MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip";
import { programWords } from "@/lib/assembler/export";
import { THEME_PREFERENCES, setThemePreference, useTheme } from "@/lib/theme";
import type { ThemePreference } from "@/lib/theme";
import { m } from "@/paraglide/messages";
import { getLocale, locales, setLocale } from "@/paraglide/runtime";
import type { Locale } from "@/paraglide/runtime";

import { cn } from "@/lib/utils";

import { buildStatusText } from "./build/build-status";
import { hex } from "./lib/format";
import { useAssembly, useIsStale, useSnapshot } from "./workbench-provider";

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

/**
 * Opens the calculator module guide, a static page in public/guide, in the
 * current language. A new tab, so the guide sits beside the editor.
 */
function GuideLink() {
  return (
    <a
      href={`/guide/${getLocale()}.html`}
      target="_blank"
      rel="noopener"
      aria-label={m.status_guide()}
      className="flex items-center gap-1.5 rounded-[3px] px-1 text-silk-3 outline-none hover:text-silk focus-visible:ring-2 focus-visible:ring-phosphor/70"
    >
      <BookOpenIcon aria-hidden className="size-3.5" />
      {/* Icon only on a phone, where the bar has no room for the words. */}
      <span className="max-sm:hidden">{m.status_guide()}</span>
    </a>
  );
}

const numberFormat = new Intl.NumberFormat(getLocale());

/**
 * The user program's instructions run so far. The number sits in a fixed
 * width of equal-width digits, and the word keeps the width of its plural,
 * so the bar doesn't shift as it counts.
 */
function InstructionCount() {
  const { userInstructions } = useSnapshot();
  return (
    <span title={m.status_instructions_hint()}>
      <span className="inline-block min-w-[9ch] text-right tabular-nums">
        {numberFormat.format(userInstructions)}
      </span>{" "}
      <span className="inline-grid">
        <span className="col-start-1 row-start-1">
          {m.status_instructions({ count: userInstructions })}
        </span>
        <span aria-hidden className="invisible col-start-1 row-start-1">
          {m.status_instructions({ count: 2 })}
        </span>
      </span>
    </span>
  );
}

/**
 * How many words the last assembled program takes, and where. While a build
 * runs, what it is doing instead, as the size is about to change.
 */
function ProgramSize() {
  const { image, building } = useAssembly();
  const stale = useIsStale();
  if (building)
    return (
      <span className="flex items-center gap-1.5 text-silk tabular-nums">
        <Spinner aria-hidden className="size-3" />
        {buildStatusText(building)}
      </span>
    );
  if (!image) return null;
  const { origin, words } = programWords(image);
  return (
    <span
      title={stale ? m.editor_modified() : m.status_size_hint()}
      className={cn("tabular-nums", stale && "text-silk-3")}
    >
      {m.words_count({ count: words.length })}
      {words.length > 0 && (
        // The range goes first when the bar is short of room.
        <span className="max-lg:hidden">
          {" · "}
          {hex(origin)}–{hex(origin + words.length - 1)}
        </span>
      )}
    </span>
  );
}

export function StatusBar() {
  const { privilege } = useSnapshot();
  return (
    // One line at every width. When it doesn't fit, as on a phone, it
    // scrolls sideways like the toolbar; the ISA name goes first.
    <footer className="relative min-w-0 border-t border-seam bg-status text-xs text-silk-2">
      <ScrollArea scrollFade fill clampContentMinWidth={false}>
        <div className="flex h-full w-max min-w-full items-center gap-5 px-3.5 whitespace-nowrap">
          <span className="max-md:hidden">{m.status_isa()}</span>
          <span>
            {privilege === "user"
              ? m.status_mode_user()
              : m.status_mode_supervisor()}
          </span>
          <InstructionCount />
          <ProgramSize />
          <span className="ml-auto flex items-center gap-4">
            <GuideLink />
            <ThemeSwitch />
            <LanguageSwitch />
          </span>
        </div>
      </ScrollArea>
    </footer>
  );
}
