import { useEffect, useRef, useState } from "react"
import { useLocale } from "../context/LocaleContext"
import { api, appMode, currentSession, waitForJob } from "../lib/api"
import { downloadProtected } from "../lib/caseData"
export default function OCRReview({ evidenceId }: { evidenceId: string }) {
  const { locale } = useLocale()
  const polling = useRef<AbortController | null>(null)
  useEffect(() => () => polling.current?.abort(), [])
  const L = (en: string, hi: string) => (locale === "hi" ? hi : en)
  const [data, setData] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [selected, setSelected] = useState(""),
    [text, setText] = useState(""),
    [reason, setReason] = useState("")
  const canEdit = ["forensics", "senior", "admin"].includes(
    currentSession()?.role,
  )
  async function load() {
    setData(await api.getOCR(evidenceId))
  }
  useEffect(() => {
    let active = true
    if (appMode === "full")
      api
        .getOCR(evidenceId)
        .then((result) => {
          if (active) setData(result)
        })
        .catch((e) => {
          if (active) setNotice(e.message)
        })
    return () => {
      active = false
    }
  }, [evidenceId])
  async function run() {
    setBusy(true)
    setNotice("")
    try {
      const job = await api.queueOCR(evidenceId)
      polling.current = new AbortController()
      await waitForJob(
        job.jobId,
        (state) =>
          setNotice(
            L(`OCR ${job.jobId}: ${state}`, `OCR ${job.jobId}: ${state}`),
          ),
        polling.current.signal,
      )
      await load()
      setNotice(
        L(
          "Extraction complete. Review OCR against the original; confidence is not an integrity guarantee.",
          "पाठ निष्कर्षण पूरा। OCR को मूल से मिलाएँ; विश्वास स्तर अखंडता की गारंटी नहीं है।",
        ),
      )
    } catch (e) {
      if (polling.current?.signal.aborted) return
      setNotice(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  async function save() {
    const page = data.pages.find((p: any) => p.id === selected)
    setBusy(true)
    try {
      await api.correctOCR(selected, page.revision, text, reason)
      await load()
      setSelected("")
      setReason("")
      setNotice(
        L(
          "Correction appended. Raw OCR and original bytes remain unchanged.",
          "सुधार जोड़ा गया। मूल OCR और फ़ाइल अपरिवर्तित हैं।",
        ),
      )
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="gov-panel p-5 space-y-4">
      <h2 className="text-xl">
        {L("English / Hindi OCR review", "अंग्रेज़ी / हिंदी OCR समीक्षा")}
      </h2>
      <p className="text-sm">
        {L(
          "Printed text recognition runs locally. Handwriting is not reliably supported. Raw output and reviewer corrections are separate.",
          "मुद्रित पाठ स्थानीय रूप से पहचाना जाता है। हस्तलिखित पाठ भरोसेमंद नहीं है। मूल पाठ और समीक्षक सुधार अलग हैं।",
        )}
      </p>
      <p className="text-xs">
        {L(
          "Searchable PDF downloads contain raw extraction, not later corrections. Existing findings retain the revision used when analyzed.",
          "खोजने योग्य PDF में मूल निष्कर्षण होता है, बाद के सुधार नहीं। पुराने निष्कर्ष अपने विश्लेषण के समय वाला संशोधन रखते हैं।",
        )}
      </p>
      <button
        className="btn-premium-outline"
        disabled={busy || appMode !== "full"}
        onClick={run}
        title={
          appMode !== "full"
            ? L("Local secure service required", "स्थानीय सुरक्षित सेवा आवश्यक है")
            : undefined
        }
      >
        {busy
          ? L("Processing…", "प्रक्रिया जारी…")
          : L("Extract text / searchable PDF", "पाठ / खोजने योग्य PDF बनाएँ")}
      </button>
      {appMode !== "full" && (
        <p className="text-sm">
          {L(
            "Local secure service required. No simulated OCR results.",
            "स्थानीय सुरक्षित सेवा आवश्यक है। कोई नकली OCR परिणाम नहीं।",
          )}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm break-all">
          {notice}
        </p>
      )}
      {data?.derivatives.map((d: any) => (
        <div
          key={d.id}
          className="border-t border-[var(--color-border-subtle)] pt-3"
        >
          <button
            className="underline text-sm"
            onClick={() =>
              downloadProtected(
                api.downloadUrl(d.downloadUrl),
                `${evidenceId}-${d.kind}.${
                  d.mime.startsWith("application/pdf")
                    ? "pdf"
                    : d.mime.startsWith("application/json")
                      ? "json"
                      : "txt"
                }`,
              ).catch((e) => setNotice(e.message))
            }
          >
            {L("Download", "डाउनलोड करें")} {d.kind}
          </button>
          <p className="font-mono text-[10px] break-all">SHA-256 {d.sha256}</p>
        </div>
      ))}
      {data?.pages.map((p: any) => (
        <article
          key={p.id}
          className="border-t border-[var(--color-border-subtle)] pt-4"
        >
          <p className="font-mono text-xs">
            {L("Page", "पृष्ठ")} {p.raw.sourcePageNumber || p.pageNumber} ·{" "}
            {p.raw.method} · {L("Revision", "संशोधन")} {p.revision} ·{" "}
            {p.raw.regions.length} {L("regions", "क्षेत्र")}
          </p>
          <pre className="text-sm whitespace-pre-wrap break-words mt-3 max-h-64 overflow-auto">
            {p.text || L("No text detected.", "कोई पाठ नहीं मिला।")}
          </pre>
          <details className="text-xs mt-3">
            <summary>
              {L(
                "Raw extraction & correction history",
                "मूल पाठ और सुधार इतिहास",
              )}
            </summary>
            <pre className="whitespace-pre-wrap break-all max-h-64 overflow-auto">
              {JSON.stringify(
                { raw: p.raw, corrections: p.corrections },
                null,
                2,
              )}
            </pre>
          </details>
          <button
            className="underline text-sm mt-3"
            disabled={!canEdit || busy}
            title={
              !canEdit
                ? L(
                    "Forensics, supervisor or admin role required",
                    "फॉरेंसिक, पर्यवेक्षक या एडमिन भूमिका आवश्यक",
                  )
                : undefined
            }
            onClick={() => {
              setSelected(p.id)
              setText(p.text)
              setReason("")
            }}
          >
            {L("Review / correct text", "पाठ की समीक्षा / सुधार")}
          </button>
          {selected === p.id && (
            <form
              className="mt-4 space-y-3"
              onSubmit={(e) => {
                e.preventDefault()
                save()
              }}
            >
              <textarea
                aria-label={L("Corrected text", "सुधारा पाठ")}
                className="gov-input w-full h-48"
                value={text}
                maxLength={200000}
                onChange={(e) => setText(e.target.value)}
              />
              <input
                aria-label={L("Correction reason", "सुधार कारण")}
                required
                maxLength={1000}
                placeholder={L("Reason for correction", "सुधार का कारण")}
                className="gov-input w-full"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <button className="btn-premium" disabled={busy || !reason.trim()}>
                {L("Append correction", "सुधार जोड़ें")}
              </button>
              <button
                type="button"
                className="btn-premium-outline ml-3"
                onClick={() => setSelected("")}
              >
                {L("Cancel", "रद्द करें")}
              </button>
            </form>
          )}
        </article>
      ))}
    </section>
  )
}
