"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export default function LandingPage() {
  const { t } = useI18n();

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="absolute inset-0 hero-gradient opacity-60"></div>
      <div className="absolute inset-0 noise"></div>
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 20%, rgba(0, 122, 255, 0.3) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(191, 90, 242, 0.3) 0%, transparent 50%)",
        }}
      ></div>

      <header className="relative z-10 max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[var(--tg-accent)] to-[var(--tg-accent-2)] flex items-center justify-center shadow-lg shadow-[var(--tg-accent)]/30">
            <span className="text-lg">⚽</span>
          </div>
          <span className="font-bold text-lg tracking-tight">{t("app.name")}</span>
          <span className="text-[9px] uppercase tracking-wider bg-white/10 text-[var(--tg-accent-2)] px-1.5 py-0.5 rounded font-bold">
            {t("app.beta")}
          </span>
        </div>
        <nav className="hidden md:flex items-center gap-6 text-sm">
          <a href="#features" className="text-[var(--tg-muted)] hover:text-white transition">
            {t("nav.features")}
          </a>
          <a href="#model" className="text-[var(--tg-muted)] hover:text-white transition">
            {t("nav.model")}
          </a>
          <a href="#accuracy" className="text-[var(--tg-muted)] hover:text-white transition">
            {t("nav.accuracy")}
          </a>
          <LanguageSwitcher compact />
        </nav>
        <Link
          href="/app"
          className="text-sm font-semibold bg-white text-black px-4 py-2 rounded-full hover:bg-white/90 transition"
        >
          {t("nav.openApp")}
        </Link>
      </header>

      <section className="relative z-10 max-w-6xl mx-auto px-6 pt-16 pb-24">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
              <span className="text-[var(--tg-muted)]">{t("landing.hero.badge")}</span>
            </div>
            <h1 className="text-5xl md:text-6xl font-black leading-[1.05] tracking-tight mb-6">
              {t("landing.hero.title1")}
              <br />
              <span className="bg-gradient-to-r from-[var(--tg-accent-2)] via-[var(--tg-accent)] to-[var(--tg-purple)] bg-clip-text text-transparent">
                {t("landing.hero.title2")}
              </span>{" "}
              {t("landing.hero.title3")}
            </h1>
            <p className="text-lg text-[var(--tg-muted)] max-w-xl mb-8 leading-relaxed">
              {t("landing.hero.subtitle")}
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/app"
                className="px-6 py-3 rounded-full bg-gradient-to-r from-[var(--tg-accent)] to-[var(--tg-accent-2)] font-bold hover:scale-105 transition-transform shadow-lg shadow-[var(--tg-accent)]/30"
              >
                {t("landing.hero.cta")}
              </Link>
              <a
                href="#model"
                className="px-6 py-3 rounded-full bg-white/5 border border-white/10 font-semibold hover:bg-white/10 transition"
              >
                {t("landing.hero.cta2")}
              </a>
            </div>
            <div className="flex items-center gap-6 mt-10 text-sm text-[var(--tg-muted)]">
              <Stat label={t("landing.hero.stat1.label")} value="68,4%" sub={t("landing.hero.stat1.sub")} />
              <div className="w-px h-10 bg-white/10"></div>
              <Stat label={t("landing.hero.stat2.label")} value="+11,2%" sub={t("landing.hero.stat2.sub")} />
              <div className="w-px h-10 bg-white/10"></div>
              <Stat label={t("landing.hero.stat3.label")} value="6" sub={t("landing.hero.stat3.sub")} />
            </div>
          </div>
          <div className="flex justify-center">
            <PhoneMockup />
          </div>
        </div>
      </section>

      <section id="features" className="relative z-10 max-w-6xl mx-auto px-6 py-20">
        <div className="text-center mb-12">
          <div className="text-xs uppercase tracking-[0.3em] text-[var(--tg-accent-2)] mb-3">
            {t("landing.features.kicker")}
          </div>
          <h2 className="text-4xl md:text-5xl font-black mb-3">{t("landing.features.title")}</h2>
          <p className="text-[var(--tg-muted)] max-w-2xl mx-auto">
            {t("landing.features.subtitle")}
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          <FeatureCard icon="🎯" title={t("landing.features.f1.title")} description={t("landing.features.f1.desc")} />
          <FeatureCard icon="💰" title={t("landing.features.f2.title")} description={t("landing.features.f2.desc")} />
          <FeatureCard icon="📊" title={t("landing.features.f3.title")} description={t("landing.features.f3.desc")} />
          <FeatureCard icon="🔴" title={t("landing.features.f4.title")} description={t("landing.features.f4.desc")} />
          <FeatureCard icon="🏆" title={t("landing.features.f5.title")} description={t("landing.features.f5.desc")} />
          <FeatureCard icon="📈" title={t("landing.features.f6.title")} description={t("landing.features.f6.desc")} />
        </div>
      </section>

      <section id="model" className="relative z-10 max-w-6xl mx-auto px-6 py-20">
        <div className="glass-strong rounded-3xl p-8 md:p-12">
          <div className="grid lg:grid-cols-2 gap-10">
            <div>
              <div className="text-xs uppercase tracking-[0.3em] text-[var(--tg-accent-2)] mb-3">
                {t("landing.model.kicker")}
              </div>
              <h2 className="text-4xl md:text-5xl font-black mb-6">{t("landing.model.title")}</h2>
              <p className="text-[var(--tg-muted)] leading-relaxed mb-6">{t("landing.model.p1")}</p>
              <p className="text-[var(--tg-muted)] leading-relaxed mb-6">{t("landing.model.p2")}</p>
              <div className="flex flex-wrap gap-2">
                {["XGBoost", "LightGBM", "RandomForest", "Dixon-Coles", "Poisson", "Elo", "Kelly", "Isotonic"].map((tag) => (
                  <span
                    key={tag}
                    className="text-xs px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[var(--tg-muted)]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            <div className="bg-black/40 rounded-2xl p-6 font-mono text-xs leading-relaxed">
              <div className="text-[var(--tg-muted)] mb-2"># Dixon-Coles correction</div>
              <pre className="text-[var(--tg-accent-2)] whitespace-pre-wrap">{`def dixon_coles_tau(x, y, λ, μ, ρ):
    if x == 0 and y == 0:
        return 1 - λ·μ·ρ
    if x == 0 and y == 1:
        return 1 + λ·ρ
    if x == 1 and y == 0:
        return 1 + μ·ρ
    if x == 1 and y == 1:
        return 1 - ρ
    return 1

P(i, j) = Poisson(i; λ) × Poisson(j; μ) × τ(i,j)`}</pre>
            </div>
          </div>
        </div>
      </section>

      <section id="accuracy" className="relative z-10 max-w-6xl mx-auto px-6 py-20">
        <div className="text-center mb-12">
          <div className="text-xs uppercase tracking-[0.3em] text-[var(--tg-accent-2)] mb-3">
            {t("landing.accuracy.kicker")}
          </div>
          <h2 className="text-4xl md:text-5xl font-black mb-3">{t("landing.accuracy.title")}</h2>
          <p className="text-[var(--tg-muted)]">{t("landing.accuracy.subtitle")}</p>
        </div>
        <div className="grid md:grid-cols-5 gap-4">
          <AccuracyCard market={t("landing.accuracy.market.1x2")} value="68%" sub="90d" />
          <AccuracyCard market={t("landing.accuracy.market.ou")} value="74%" sub="90d" />
          <AccuracyCard market={t("landing.accuracy.market.btts")} value="70%" sub="90d" />
          <AccuracyCard market={t("landing.accuracy.market.exact")} value="16%" sub="90d" />
          <AccuracyCard market={t("landing.accuracy.market.value")} value="63%" sub="+11,2% EV" />
        </div>
      </section>

      <section className="relative z-10 max-w-4xl mx-auto px-6 py-20 text-center">
        <div className="glass-strong rounded-3xl p-10 md:p-14 relative overflow-hidden">
          <div className="absolute inset-0 shimmer"></div>
          <div className="relative">
            <div className="text-6xl mb-4">⚽</div>
            <h2 className="text-4xl md:text-5xl font-black mb-4">{t("landing.cta.title")}</h2>
            <p className="text-[var(--tg-muted)] max-w-xl mx-auto mb-8">{t("landing.cta.subtitle")}</p>
            <Link
              href="/app"
              className="inline-flex px-8 py-4 rounded-full bg-gradient-to-r from-[var(--tg-accent)] to-[var(--tg-accent-2)] font-bold text-lg hover:scale-105 transition-transform shadow-xl shadow-[var(--tg-accent)]/40"
            >
              {t("landing.cta.button")}
            </Link>
          </div>
        </div>
      </section>

      <footer className="relative z-10 border-t border-white/5 py-8 text-center text-xs text-[var(--tg-muted)]">
        <p>{t("landing.footer.built")}</p>
        <p className="mt-1">{t("landing.footer.warning")}</p>
      </footer>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div>
      <div className="text-xs text-[var(--tg-muted)]">{label}</div>
      <div className="text-2xl font-black">{value}</div>
      <div className="text-[10px] text-[var(--tg-muted)]">{sub}</div>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div className="glass rounded-2xl p-6 hover:border-[var(--tg-accent)]/40 transition-all group">
      <div className="text-4xl mb-3 group-hover:scale-110 transition-transform">{icon}</div>
      <h3 className="font-bold mb-2">{title}</h3>
      <p className="text-sm text-[var(--tg-muted)] leading-relaxed">{description}</p>
    </div>
  );
}

function AccuracyCard({ market, value, sub }: { market: string; value: string; sub: string }) {
  return (
    <div className="glass rounded-2xl p-5 text-center">
      <div className="text-xs text-[var(--tg-muted)] mb-2 uppercase tracking-wider">{market}</div>
      <div className="text-4xl font-black bg-gradient-to-b from-[var(--tg-green)] to-emerald-400 bg-clip-text text-transparent">
        {value}
      </div>
      <div className="text-[10px] text-[var(--tg-muted)] mt-1">{sub}</div>
    </div>
  );
}

function PhoneMockup() {
  return (
    <div className="relative">
      <div className="absolute -inset-10 bg-gradient-to-tr from-[var(--tg-accent)]/30 to-[var(--tg-purple)]/30 blur-3xl rounded-full"></div>
      <div className="relative w-[280px] h-[580px] rounded-[44px] bg-gradient-to-b from-[#1a1a20] to-[#0f0f11] border-[10px] border-black shadow-2xl">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-6 bg-black rounded-b-2xl"></div>
        <div className="h-full w-full rounded-[32px] overflow-hidden bg-[#0f0f11] p-3 pt-8">
          <div className="text-[10px] text-center text-[var(--tg-muted)] mb-3">Aujourd'hui</div>
          <MockMatch home="Man City" away="Arsenal" live minute="67'" hp={58} dp={22} ap={20} />
          <MockMatch home="Inter" away="Napoli" live={false} minute="" hp={52} dp={26} ap={22} />
          <MockMatch home="Bayern" away="Dortmund" live={false} minute="" hp={68} dp={19} ap={13} />
        </div>
      </div>
    </div>
  );
}

function MockMatch({
  home,
  away,
  live,
  minute,
  hp,
  dp,
  ap,
}: {
  home: string;
  away: string;
  live: boolean;
  minute: string;
  hp: number;
  dp: number;
  ap: number;
}) {
  return (
    <div className="bg-[#1c1c21] border border-white/5 rounded-xl p-3 mb-2">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[9px] text-[var(--tg-muted)]">🏴󠁧󠁢󠁥󠁮󠁧󠁿 Premier League</span>
        {live ? (
          <span className="text-[8px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded font-bold">
            ● LIVE {minute}
          </span>
        ) : (
          <span className="text-[9px] text-[var(--tg-accent-2)]">17:30</span>
        )}
      </div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex-1">
          <div className="text-[11px] font-semibold">{home}</div>
          <div className="text-[11px] font-semibold">{away}</div>
        </div>
      </div>
      <div className="space-y-1">
        <MiniBar color="bg-[var(--tg-accent)]" pct={hp} />
        <MiniBar color="bg-[var(--tg-muted)]" pct={dp} />
        <MiniBar color="bg-[var(--tg-purple)]" pct={ap} />
      </div>
    </div>
  );
}

function MiniBar({ color, pct }: { color: string; pct: number }) {
  return (
    <div className="h-0.5 bg-black/40 rounded-full overflow-hidden">
      <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
    </div>
  );
}
