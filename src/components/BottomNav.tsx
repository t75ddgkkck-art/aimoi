"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n";

export function BottomNav() {
  const path = usePathname();
  const { t } = useI18n();

  const tabs = [
    { href: "/app", label: t("common.today"), icon: "⚽" },
    { href: "/app/live", label: "Live", icon: "🔴" },
    { href: "/app/value", label: t("common.value"), icon: "💰" },
    { href: "/app/leagues", label: t("common.leagues"), icon: "🏆" },
    { href: "/app/history", label: "Bilan", icon: "📜" },
    { href: "/app/stats", label: t("common.stats"), icon: "📊" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 glass-strong border-t border-[var(--tg-border)]">
      <div className="max-w-md mx-auto grid grid-cols-6 px-1 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
        {tabs.map((tab) => {
          const active = path === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-col items-center gap-0.5 py-2 rounded-xl transition-all duration-200 ${
                active
                  ? "text-[var(--tg-accent)] bg-[var(--tg-accent)]/10 scale-105"
                  : "text-[var(--tg-muted)] hover:text-white active:scale-95"
              }`}
            >
              <span className={`text-lg leading-none transition-transform ${active ? "scale-110" : ""}`}>{tab.icon}</span>
              <span className="text-[8px] font-semibold tracking-tight uppercase">
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
