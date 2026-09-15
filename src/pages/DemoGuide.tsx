import { useState } from "react"
import { ChevronRight, Shield } from "../components/icons"
import { api, appMode, currentSession } from "../lib/api"
import { useLocale } from "../context/LocaleContext"

export default function DemoGuide({
  onNavigate,
}: {
  onNavigate: (page: string, param?: string) => void
}) {
  const { locale } = useLocale()
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const L = (en: string, hi: string) => (locale === "hi" ? hi : en)
  const steps = [
    [
      "Open Operation Nightfall",
      "ऑपरेशन नाइटफॉल खोलें",
      "case-detail",
      "CASE-2026-017",
    ],
    ["Inspect and upload evidence", "साक्ष्य देखें और अपलोड करें", "evidence"],
    ["View evidence-backed graph", "साक्ष्य-आधारित ग्राफ़ देखें", "graph"],
    ["Reconstruct the timeline", "घटनाक्रम देखें", "timeline"],
    ["Review locations on the map", "मानचित्र पर स्थान देखें", "map"],
    ["Find the bridge entity", "साझा इकाई खोजें", "network"],
    ["Ask the grounded Copilot", "साक्ष्य-आधारित सहायक से पूछें", "graph"],
    ["Generate the investigation report", "जाँच रिपोर्ट बनाएँ", "reports"],
  ]
  async function reset() {
    if (
      !window.confirm(
        L(
          "Reset all demo cases, evidence and analysis? This does not erase the immutable local blockchain.",
          "सभी डेमो केस, साक्ष्य और विश्लेषण रीसेट करें? अपरिवर्तनीय ब्लॉकचेन इतिहास बना रहेगा।",
        ),
      )
    )
      return
    setBusy(true)
    try {
      await api.resetDemo()
      setMessage(
        L(
          "Demo database reset. Restart the ephemeral Hardhat stack for a completely fresh blockchain.",
          "डेमो डेटाबेस रीसेट हुआ। नए ब्लॉकचेन के लिए अस्थायी Hardhat सेवाएँ पुनः बनाएँ।",
        ),
      )
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Reset failed.")
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="min-h-screen bg-[var(--color-base-bg)]">
      <header className="bg-[var(--color-primary)] p-8 text-white">
        <div className="max-w-[1000px] mx-auto">
          <p className="font-mono text-xs text-white/65">
            JUDGE DEMONSTRATION · 8 MINUTES
          </p>
          <h1 className="text-4xl !text-white mt-2">
            {locale === "hi"
              ? "ऑपरेशन नाइटफॉल प्रदर्शन"
              : "Operation Nightfall walkthrough"}
          </h1>
          <p className="text-white/75 mt-3">
            {locale === "hi"
              ? "मूल साक्ष्य से मानव-समीक्षित रिपोर्ट तक एक जुड़ी कहानी।"
              : "One connected story from source evidence to a human-reviewed report."}
          </p>
        </div>
      </header>
      <main className="max-w-[1000px] mx-auto p-6">
        <div className="gov-panel p-4 mb-5 flex items-start gap-3">
          <Shield />
          <div>
            <strong>
              {appMode === "full"
                ? "Full secure stack"
                : "Public showcase mode"}
            </strong>
            <p className="text-sm mt-1">
              {appMode === "full"
                ? "Service errors are shown explicitly; confirmation requires a real blockchain receipt."
                : "Explore fictional evidence here. Local secure service required for persistence and blockchain writes."}
            </p>
          </div>
        </div>
        <div className="space-y-3">
          {steps.map(([en, hi, page, param], i) => (
            <button
              key={en}
              onClick={() => onNavigate(page, param)}
              className="gov-panel w-full p-5 flex items-center gap-4 text-left hover:border-[var(--color-primary)]"
            >
              <span className="w-9 h-9 bg-[var(--color-primary)] text-white grid place-items-center font-mono">
                {i + 1}
              </span>
              <strong className="flex-1">{locale === "hi" ? hi : en}</strong>
              <ChevronRight size={17} />
            </button>
          ))}
        </div>
        {appMode === "full" && currentSession()?.role === "admin" && (
          <button
            className="btn-premium-outline mt-6"
            disabled={busy}
            onClick={reset}
          >
            {busy ? "Resetting…" : "Reset demo data (admin)"}
          </button>
        )}
        {message && (
          <p role="status" className="gov-panel p-4 mt-4">
            {message}
          </p>
        )}
      </main>
    </div>
  )
}
