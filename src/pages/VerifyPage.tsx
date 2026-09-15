import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useLocale } from "../context/LocaleContext"
import { api, appMode } from "../lib/api"
import { loadSnapshot } from "../lib/caseData"
import QRScanner from "../components/QRScanner"
export default function VerifyPage({
  onNavigate,
}: {
  onNavigate: (page: string, param?: string) => void
}) {
  const navigate = useNavigate(),
    { token = "" } = useParams(),
    { locale } = useLocale()
  const L = (en: string, hi: string) => (locale === "hi" ? hi : en)
  const [data, setData] = useState<any>(null),
    [error, setError] = useState("")
  useEffect(() => {
    let active = true
    setData(null)
    setError("")
    if (!token) return
    async function check() {
      try {
        const result =
          appMode === "full"
            ? await api.publicVerify(token)
            : await (async () => {
                const pack = await loadSnapshot("CASE-2026-017"),
                  item = pack.evidence.find(
                    (e) => e.verification_token === token,
                  )
                if (!item)
                  throw new Error(
                    L(
                      "Verification identity not found.",
                      "सत्यापन पहचान नहीं मिली।",
                    ),
                  )
                return {
                  evidenceId: item.id,
                  caseId: item.case_id,
                  name: item.name,
                  sha256: item.sha256,
                  status: "SHOWCASE / NOT ANCHORED",
                  blockchainRegistered: false,
                }
              })()
        if (active) setData(result)
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : String(e))
      }
    }
    check()
    return () => {
      active = false
    }
  }, [token, locale])
  return (
    <main className="holographic-bg min-h-screen p-4 sm:p-6">
      <div className="w-full max-w-2xl mx-auto space-y-5">
        <section className="gov-panel p-6">
          <p className="font-mono text-xs">DECYPHER BY EPOCH</p>
          <h1 className="text-3xl mt-3">
            {L("Evidence identity verification", "साक्ष्य पहचान सत्यापन")}
          </h1>
          {error ? (
            <p role="alert" className="mt-5">
              {error}
            </p>
          ) : token && !data ? (
            <p role="status" className="mt-5">
              {L("Checking identity…", "पहचान जाँची जा रही है…")}
            </p>
          ) : (
            data && (
              <>
                <dl className="grid sm:grid-cols-2 gap-4 mt-6">
                  {[
                    [L("Evidence ID", "साक्ष्य पहचान"), data.evidenceId],
                    [L("Case", "केस"), data.caseId],
                    [L("Source name", "स्रोत नाम"), data.name],
                    [L("Live chain status", "लाइव ब्लॉकचेन स्थिति"), data.status],
                  ].map(([key, value]) => (
                    <div key={key} className="p-4 bg-[var(--color-surface-2)]">
                      <dt className="text-xs">{key}</dt>
                      <dd className="font-mono text-sm break-all mt-2">
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="font-mono text-xs break-all mt-5">
                  SHA-256 {data.sha256}
                </p>
                <p className="mt-5 text-sm">
                  {appMode === "full"
                    ? L(
                        "Identity lookup does not rehash the file. Sign in and Verify stored evidence for full integrity verification.",
                        "पहचान जाँच नया फ़ाइल हैश नहीं बनाती। पूरी अखंडता जाँच के लिए साइन इन करके सहेजा साक्ष्य सत्यापित करें।",
                      )
                    : L(
                        "Showcase only: no blockchain receipt has been fabricated. Local secure service required for full verification.",
                        "केवल प्रदर्शन: कोई नकली रसीद नहीं। पूरी जाँच के लिए स्थानीय सुरक्षित सेवा आवश्यक है।",
                      )}
                </p>
                {data.blockchainRegistered && (
                  <p className="font-mono text-xs break-all mt-4">
                    {data.transactionHash}
                  </p>
                )}
                <button
                  className="btn-premium mt-5"
                  onClick={() =>
                    navigate(`/evidence/${encodeURIComponent(data.evidenceId)}`)
                  }
                >
                  {L("Open secure evidence record", "सुरक्षित साक्ष्य रिकॉर्ड खोलें")}
                </button>
              </>
            )
          )}
          <button
            className="btn-premium-outline mt-5"
            onClick={() => onNavigate("landing")}
          >
            {L("Return to Decypher", "डिसाइफ़र पर लौटें")}
          </button>
        </section>
        <QRScanner
          onToken={(value) => navigate(`/verify/${encodeURIComponent(value)}`)}
        />
      </div>
    </main>
  )
}
