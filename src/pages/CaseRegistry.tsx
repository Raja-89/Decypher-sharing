import { useEffect, useState } from "react"
import { useLocale } from "../context/LocaleContext"
import { api, appMode, currentSession } from "../lib/api"
import { loadCases } from "../lib/caseData"
import { isValidationCase, richNightfallId } from "../lib/demoPresentation"

export default function CaseRegistry({
  onNavigate,
}: {
  onNavigate: (page: string, param?: string) => void
}) {
  const { locale } = useLocale()
  const L = (en: string, hi: string) => (locale === "hi" ? hi : en)
  const [cases, setCases] = useState<any[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true)
  const [create, setCreate] = useState(false),
    [busy, setBusy] = useState(false),
    [showTests, setShowTests] = useState(false)
  const [form, setForm] = useState({
      title: "",
      description: "",
      priority: "medium",
    }),
    [search, setSearch] = useState("")
  useEffect(() => {
    loadCases(true)
      .then((items) =>
        setCases(
          items.sort(
            (a, b) =>
              Number(b.id === richNightfallId) -
                Number(a.id === richNightfallId) ||
              Number(b.id.startsWith("CASE-SYN-")) -
                Number(a.id.startsWith("CASE-SYN-")),
          ),
        ),
      )
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError("")
    try {
      const item = await api.createCase(form)
      onNavigate("case-detail", item.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  const investigations = cases.filter((c) => !isValidationCase(c))
  const shown = cases
    .filter((c) => showTests || !isValidationCase(c))
    .filter((c) =>
      `${c.title} ${c.title_hi} ${c.id}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    )
  const evidenceLinks = investigations.reduce(
    (sum, c) => sum + (c.counts?.evidence || 0),
    0,
  )
  return (
    <div className="min-h-screen bg-[var(--color-base-bg)]">
      <header className="bg-[var(--color-primary)] text-white p-8">
        <div className="max-w-[1200px] mx-auto">
          <p className="text-xs font-mono text-white/70">DECYPHER BY EPOCH</p>
          <h1 className="!text-white text-3xl mt-2">
            {L("Investigation command centre", "जाँच कमांड सेंटर")}
          </h1>
          <p className="mt-3 text-white/75">
            {L(
              "Follow source evidence, competing accounts and connected trails. All demonstration investigations are fictional.",
              "मूल साक्ष्य, भिन्न बयानों और जुड़े संकेतों की समीक्षा करें। सभी प्रदर्शन जाँच काल्पनिक हैं।",
            )}
          </p>
        </div>
      </header>
      <main className="max-w-[1200px] mx-auto p-6 space-y-5">
        {!loading && (
          <section className="gov-panel p-5">
            <p className="font-mono">
              {investigations.length} {L("investigations", "जाँच")} ·{" "}
              {evidenceLinks}{" "}
              {L(
                "evidence links across cases (shared sources included)",
                "केस में साक्ष्य लिंक (साझा स्रोत सहित)",
              )}
            </p>
          </section>
        )}
        <div className="flex flex-wrap justify-between gap-4">
          <input
            aria-label={L("Search cases", "केस खोजें")}
            placeholder={L("Search cases", "केस खोजें")}
            className="gov-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="flex gap-3">
            <button
              className="btn-premium-outline"
              onClick={() => onNavigate("demo")}
            >
              {L("Guided demo", "प्रदर्शन मार्गदर्शिका")}
            </button>
            <button
              className="btn-premium"
              disabled={
                appMode !== "full" || currentSession()?.role === "forensics"
              }
              title={
                appMode !== "full"
                  ? L(
                      "Local secure service required",
                      "स्थानीय सुरक्षित सेवा आवश्यक",
                    )
                  : currentSession()?.role === "forensics"
                    ? L(
                        "Investigator, supervisor or admin required",
                        "जाँचकर्ता, पर्यवेक्षक या एडमिन आवश्यक",
                      )
                    : undefined
              }
              onClick={() => setCreate(true)}
            >
              {L("New case", "नया केस")}
            </button>
          </div>
        </div>
        {cases.some(isValidationCase) && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showTests}
              onChange={(e) => setShowTests(e.target.checked)}
            />
            {L(
              "Show retained validation records",
              "संरक्षित परीक्षण रिकॉर्ड दिखाएँ",
            )}{" "}
            ({cases.length - investigations.length})
          </label>
        )}
        {error && (
          <p role="alert" className="gov-panel p-4">
            {error}
          </p>
        )}
        {loading ? (
          <p role="status">{L("Loading cases…", "केस लोड हो रहे हैं…")}</p>
        ) : (
          <div className="grid md:grid-cols-2 gap-5">
            {shown.map((c) => (
              <button
                key={c.id}
                onClick={() => onNavigate("case-detail", c.id)}
                className="gov-panel p-6 text-left hover:border-[var(--color-primary)]"
              >
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="gov-chip">
                    {c.priority?.toUpperCase()} · {c.status?.toUpperCase()}
                  </span>
                  {c.id === richNightfallId && (
                    <span className="gov-chip">
                      {L("FEATURED INVESTIGATION", "मुख्य जाँच")}
                    </span>
                  )}
                  {isValidationCase(c) && (
                    <span className="gov-chip">
                      {L("VALIDATION ONLY", "केवल परीक्षण")}
                    </span>
                  )}
                </div>
                <p className="font-mono text-xs text-[var(--color-text-muted)] mt-3 break-all">
                  {c.case_number || c.id}
                </p>
                <h2 className="text-xl mt-3">
                  {locale === "hi" ? c.title_hi || c.title : c.title}
                </h2>
                <p className="text-sm mt-3 leading-relaxed">
                  {locale === "hi"
                    ? c.description_hi || c.description
                    : c.description}
                </p>
                <p className="text-xs mt-3 text-[var(--color-text-muted)]">
                  {c.lead_investigator}
                </p>
                {c.counts && (
                  <div className="flex flex-wrap gap-3 border-t border-[var(--color-border-subtle)] pt-4 mt-4 font-mono text-xs">
                    <span>
                      {c.counts.evidence} {L("evidence", "साक्ष्य")}
                    </span>
                    <span>
                      {c.counts.entities} {L("entities", "इकाइयाँ")}
                    </span>
                    <span>
                      {c.counts.relationships} {L("relationships", "संबंध")}
                    </span>
                    <span>
                      {c.counts.alerts} {L("alerts", "संकेत")}
                    </span>
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
        {!loading && !shown.length && (
          <p className="gov-panel p-6">
            {L("No matching investigations.", "कोई मेल खाती जाँच नहीं।")}
          </p>
        )}
        {create && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label={L("Create case", "केस बनाएँ")}
            className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-5"
          >
            <form
              className="gov-panel p-6 w-full max-w-lg space-y-4"
              onSubmit={submit}
            >
              <h2 className="text-xl">{L("Create case", "केस बनाएँ")}</h2>
              <label className="block">
                {L("Title", "शीर्षक")}
                <input
                  required
                  minLength={3}
                  maxLength={255}
                  className="gov-input block w-full mt-2"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </label>
              <label className="block">
                {L("Description", "विवरण")}
                <textarea
                  required
                  minLength={10}
                  className="gov-input block w-full mt-2"
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                />
              </label>
              <label className="block">
                {L("Priority", "प्राथमिकता")}
                <select
                  className="gov-input ml-3"
                  value={form.priority}
                  onChange={(e) =>
                    setForm({ ...form, priority: e.target.value })
                  }
                >
                  {["low", "medium", "high", "critical"].map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>
              {error && <p role="alert">{error}</p>}
              <div className="flex gap-3">
                <button className="btn-premium" disabled={busy}>
                  {L("Create", "बनाएँ")}
                </button>
                <button
                  type="button"
                  className="btn-premium-outline"
                  disabled={busy}
                  onClick={() => setCreate(false)}
                >
                  {L("Cancel", "रद्द करें")}
                </button>
              </div>
            </form>
          </div>
        )}
      </main>
    </div>
  )
}
