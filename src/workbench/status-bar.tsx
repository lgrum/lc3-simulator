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

export function StatusBar() {
  const { privilege } = useSnapshot();
  return (
    <footer className="flex items-center gap-5 border-t border-[#1c1d1f] bg-[#222426] px-3.5 text-xs text-silk-2">
      <span>{m.status_isa()}</span>
      <span>
        {privilege === "user"
          ? m.status_mode_user()
          : m.status_mode_supervisor()}
      </span>
      <span className="ml-auto">
        <LanguageSwitch />
      </span>
    </footer>
  );
}
