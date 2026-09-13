import { useState, useEffect } from "react";
import { Shield, Menu, X } from "./icons";
import StateEmblem from "./StateEmblem";
import { useLocale } from "../context/LocaleContext";

interface CypherNavbarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  isLoggedIn?: boolean;
  onLogout?: () => void;
  userRole?: string;
}

// Decypher platform mark (flat, no gradient). Used on the Login screen; the
// navbar itself uses the /copy.png raster mark.
export function DecypherLogo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const s = size === "sm" ? 28 : size === "lg" ? 48 : 36;
  return (
    <svg width={s} height={s} viewBox="0 0 40 40" className="flex-shrink-0" aria-hidden="true">
      {/* Shield */}
      <path
        d="M 20 4 L 34 10 L 34 22 C 34 30 28 36 20 38 C 12 36 6 30 6 22 L 6 10 Z"
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth="2"
      />
      {/* Network nodes */}
      <circle cx="20" cy="14" r="2.5" fill="var(--color-primary)" />
      <circle cx="14" cy="24" r="2.5" fill="var(--color-accent)" />
      <circle cx="26" cy="24" r="2.5" fill="var(--color-accent)" />
      <circle cx="20" cy="30" r="2" fill="var(--color-primary)" />
      {/* Edges */}
      <line x1="20" y1="14" x2="14" y2="24" stroke="var(--color-border-strong)" strokeWidth="1" />
      <line x1="20" y1="14" x2="26" y2="24" stroke="var(--color-border-strong)" strokeWidth="1" />
      <line x1="14" y1="24" x2="20" y2="30" stroke="var(--color-border-strong)" strokeWidth="1" />
      <line x1="26" y1="24" x2="20" y2="30" stroke="var(--color-border-strong)" strokeWidth="1" />
    </svg>
  );
}

// ─── UTILITY BAR (light GoI identity strip + working accessibility controls) ──
const TEXT_LEVELS = [
  { key: 0, label: "A-", scale: 0.9, title: "Decrease text size", fs: "11px" },
  { key: 1, label: "A", scale: 1.0, title: "Default text size", fs: "13px" },
  { key: 2, label: "A+", scale: 1.15, title: "Increase text size", fs: "15px" },
];

function UtilityBar() {
  const { locale: lang, setLocale: setLang, t } = useLocale();
  const [level, setLevel] = useState<number>(() => {
    const v = localStorage.getItem("ui.textLevel");
    return v != null ? Number(v) : 1;
  });
  const [contrast, setContrast] = useState<boolean>(() => localStorage.getItem("ui.contrast") === "1");

  useEffect(() => {
    const scale = TEXT_LEVELS[level]?.scale ?? 1;
    (document.body.style as unknown as { zoom: string }).zoom = String(scale);
    localStorage.setItem("ui.textLevel", String(level));
  }, [level]);

  useEffect(() => {
    document.documentElement.classList.toggle("hc", contrast);
    localStorage.setItem("ui.contrast", contrast ? "1" : "0");
  }, [contrast]);

  const govName = lang === "hi" ? "डिसाइफ़र बाय एपॉक" : "Decypher by Epoch";
  const ministry = lang === "hi" ? "काल्पनिक जाँच प्रदर्शन" : "Fictional investigation prototype";

  const segBtn = (active: boolean) =>
    `px-2 py-1 transition-colors ${
      active
        ? "bg-[var(--color-primary)] text-white"
        : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
    }`;

  return (
    <div className="w-full bg-[var(--color-surface-2)] border-b border-[var(--color-border-subtle)] py-1.5 px-4">
      <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
        <div className="flex items-center gap-3">
          <StateEmblem size={42} className="text-[var(--color-primary)]" />
          <div className="leading-tight">
            <div className="font-semibold text-[13px] text-[var(--color-text-primary)]">{govName}</div>
            <div className="text-[11px] text-[var(--color-text-muted)]">{ministry}</div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-[12px]">
          <span className="hidden md:inline text-[var(--color-text-muted)] mr-0.5">{t("accessibility")}</span>

          {/* Text size */}
          <div className="flex items-center border border-[var(--color-border-strong)] rounded-sm overflow-hidden" role="group" aria-label="Text size">
            {TEXT_LEVELS.map((t) => (
              <button
                key={t.key}
                onClick={() => setLevel(t.key)}
                aria-pressed={level === t.key}
                title={t.title}
                className={`${segBtn(level === t.key)} border-r border-[var(--color-border-strong)] last:border-r-0 font-semibold`}
                style={{ fontSize: t.fs }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* High contrast */}
          <button
            onClick={() => setContrast((c) => !c)}
            aria-pressed={contrast}
            title="Toggle high contrast"
            className={`px-2.5 py-1 rounded-sm border font-medium transition-colors ${
              contrast
                ? "bg-[var(--color-primary)] text-white border-[var(--color-primary)]"
                : "border-[var(--color-border-strong)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
            }`}
          >
            {lang==="hi"?"उच्च कंट्रास्ट":"High Contrast"}
          </button>

          {/* Language */}
          <div className="flex items-center border border-[var(--color-border-strong)] rounded-sm overflow-hidden" role="group" aria-label="Language">
            <button onClick={() => setLang("en")} aria-pressed={lang === "en"} className={`${segBtn(lang === "en")} border-r border-[var(--color-border-strong)] font-medium`}>
              English
            </button>
            <button onClick={() => setLang("hi")} aria-pressed={lang === "hi"} className={`${segBtn(lang === "hi")} font-medium`}>
              हिंदी
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN NAV ────────────────────────────────────────────────────────────────
export default function CypherNavbar({ currentPage, onNavigate, isLoggedIn, onLogout, userRole }: CypherNavbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { t } = useLocale();

  const landingNavItems = [
    { id: "landing", label: t("home") },
    { id: "capabilities", label: t("capabilities") },
    { id: "how-it-works", label: t("how") },
    { id: "security", label: t("security") },
    { id: "about", label: t("about") },
  ];

  const appNavItems = [
    { id: "dashboard", label: t("dashboard") },
    { id: "cases", label: t("cases") },
    { id: "graph", label: t("graph") },
    { id: "timeline", label: t("timeline") },
    { id: "map", label: t("map") },
    { id: "evidence", label: t("evidence") },
    { id: "network", label: t("network") },
    { id: "reports", label: t("reports") },
  ];

  const navItems = isLoggedIn ? appNavItems : landingNavItems;

  const roleLabel =
    userRole === "senior" ? "Sr. Investigator" : userRole === "forensics" ? "Forensics" : userRole === "admin" ? "Administrator" : "Investigator";
  const roleInitials = userRole === "admin" ? "AD" : userRole === "senior" ? "SI" : userRole === "forensics" ? "FR" : "IN";

  return (
    <div className="sticky top-0 z-50">
      <a href="#main-content" className="skip-link">Skip to main content</a>

      {/* Tiranga strip */}
      <div className="tricolor-strip" aria-hidden="true">
        <div className="flag-saffron" />
        <div className="flag-white" />
        <div className="flag-green" />
      </div>

      <UtilityBar />

      <nav className="bg-[var(--color-surface)] border-b-2 border-[var(--color-primary)]" aria-label="Primary">
        <div className="max-w-[1440px] mx-auto px-4 flex items-center justify-between h-[68px]">
          {/* Platform mark */}
          <button
            className="flex items-center gap-3 flex-shrink-0"
            onClick={() => onNavigate(isLoggedIn ? "dashboard" : "landing")}
          >
            <img src="/copy.png" alt="Decypher" className="w-11 h-11 object-contain" />
            <div className="hidden sm:block text-left border-l-2 border-[var(--color-border-strong)] pl-3">
              <div className="font-bold text-[var(--color-primary)] text-[19px] leading-tight tracking-tight">Decypher <span className="text-[11px] font-semibold text-[var(--color-text-muted)]">by Epoch</span></div>
              <div className="text-[10.5px] text-[var(--color-text-secondary)] leading-tight font-semibold tracking-wide uppercase">
                Criminal Network Intelligence
              </div>
            </div>
          </button>

          {/* Desktop nav */}
          <div className="hidden lg:flex items-center gap-0.5">
            {navItems.map((item) => {
              const isActive = currentPage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  aria-current={isActive ? "page" : undefined}
                  className={`px-3.5 py-2 text-[12.5px] font-semibold uppercase tracking-wide border-b-[3px] transition-colors ${
                    isActive
                      ? "text-[var(--color-primary)] border-[var(--color-saffron)]"
                      : "text-[var(--color-text-secondary)] border-transparent hover:text-[var(--color-primary)] hover:bg-[var(--color-surface-hover)]"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          {/* Right */}
          <div className="flex items-center gap-3">
            {isLoggedIn ? (
              <div className="flex items-center gap-3">
                <div className="hidden sm:flex items-center gap-2.5 text-[12px] bg-[var(--color-surface-2)] px-3 py-1.5 rounded-sm border border-[var(--color-border-subtle)]">
                  <div className="w-8 h-8 rounded-sm bg-[var(--color-primary)] flex items-center justify-center text-white font-bold text-[11px] font-mono">
                    {roleInitials}
                  </div>
                  <div>
                    <div className="font-semibold text-[var(--color-text-primary)]">{roleLabel}</div>
                    <div className="text-[10px] text-[var(--color-text-muted)]">Authorized Access</div>
                  </div>
                </div>
                <button className="btn-premium-outline btn-sm" onClick={onLogout}>
                  {t("logout")}
                </button>
              </div>
            ) : (
              <button className="btn-premium btn-sm" onClick={() => onNavigate("login")}>
                <Shield size={14} />
                {t("login")}
              </button>
            )}

            {/* Mobile menu toggle */}
            <button
              className="lg:hidden p-2 rounded-sm text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] hover:bg-[var(--color-surface-hover)] transition-colors"
              onClick={() => setMenuOpen((m) => !m)}
              aria-label="Toggle navigation menu"
              aria-expanded={menuOpen}
            >
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="lg:hidden bg-[var(--color-surface-2)] border-t border-[var(--color-border-subtle)] px-4 py-3 flex flex-col gap-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                aria-current={currentPage === item.id ? "page" : undefined}
                className={`text-left px-4 py-2.5 rounded-sm text-[13px] font-semibold uppercase tracking-wide transition-colors ${
                  currentPage === item.id
                    ? "text-white bg-[var(--color-primary)]"
                    : "text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] hover:bg-[var(--color-surface)]"
                }`}
                onClick={() => {
                  onNavigate(item.id);
                  setMenuOpen(false);
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
      </nav>
    </div>
  );
}
