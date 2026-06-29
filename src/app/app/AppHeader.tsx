"use client";

import { useEffect, useState } from "react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useI18n } from "@/lib/i18n";

export function AppHeader() {
  const { t } = useI18n();
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(i);
  }, []);

  // Background heartbeat: keeps live scores fresh by triggering the sync pipeline.
  useEffect(() => {
    const ping = () => fetch("/api/cron", { cache: "no-store" }).catch(() => {});
    ping();
    const i = setInterval(ping, 90_000); // every 90s
    return () => clearInterval(i);
  }, []);

  return (
    <div className="max-w-md mx-auto px-4 pt-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[var(--tg-accent)] to-[var(--tg-accent-2)] flex items-center justify-center">
            <span className="text-sm">⚽</span>
          </div>
          <div>
            <div className="font-bold text-sm leading-tight">{t("app.name")}</div>
            <div className="text-[10px] text-[var(--tg-muted)]">
              {now.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "short" })}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <div className="text-[10px] text-[var(--tg-muted)]">Heure de Paris</div>
            <div className="font-bold text-xs tabular-nums">
              {now.toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
          <LanguageSwitcher compact />
        </div>
      </div>
    </div>
  );
}
