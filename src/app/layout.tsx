import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { I18nWrapper } from "./I18nWrapper";

export const metadata: Metadata = {
  title: "GoalMind AI — Football Prediction Bot & Mini App",
  description:
    "AI-powered football predictions. Dixon-Coles Poisson ensemble model, real-time value bets, exact score matrix, and a Telegram Mini App for the world's top leagues.",
};

export const viewport: Viewport = {
  themeColor: "#0f0f11",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className="dark">
      <body className="bg-[var(--tg-bg)] text-[var(--tg-text)] antialiased min-h-screen">
        <I18nWrapper>{children}</I18nWrapper>
      </body>
    </html>
  );
}
