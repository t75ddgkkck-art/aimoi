"use client";

import { useI18n } from "@/lib/i18n";

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale } = useI18n();

  return (
    <div className="flex items-center gap-0.5 bg-white/5 border border-white/10 rounded-full p-0.5">
      <button
        onClick={() => setLocale("fr")}
        className={`px-2 py-1 rounded-full text-xs font-semibold transition-all ${
          locale === "fr"
            ? "bg-white text-black"
            : "text-[var(--tg-muted)] hover:text-white"
        }`}
        aria-label="Français"
      >
        {compact ? "FR" : "🇫🇷 FR"}
      </button>
      <button
        onClick={() => setLocale("en")}
        className={`px-2 py-1 rounded-full text-xs font-semibold transition-all ${
          locale === "en"
            ? "bg-white text-black"
            : "text-[var(--tg-muted)] hover:text-white"
        }`}
        aria-label="English"
      >
        {compact ? "EN" : "🇬🇧 EN"}
      </button>
    </div>
  );
}
