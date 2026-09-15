import { useEffect, useRef, useState } from "react"
import { useLocale } from "../context/LocaleContext"
import { api, appMode, browserSha256, waitForJob } from "../lib/api"
import useCamera from "./useCamera"
import { editedCapture } from "../lib/scanner"

type Capture = {
  key: string
  file: File
  url: string
  hash: string
  corners: number[][]
  rotation: number
  evidenceId?: string
}
const originalCorners = () => [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
]
export default function DocumentScanner({
  caseId,
  onEvidence,
}: {
  caseId: string
  onEvidence: (id: string) => void
}) {
  const { locale } = useLocale(),
    camera = useCamera(),
    mounted = useRef(true),
    captures = useRef<Capture[]>([]),
    requestKey = useRef(crypto.randomUUID()),
    polling = useRef<AbortController | null>(null)
  const L = (en: string, hi: string) => (locale === "hi" ? hi : en)
  const [pages, setPages] = useState<Capture[]>([]),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("")
  function change(next: Capture[]) {
    captures.current = next
    setPages(next)
    requestKey.current = crypto.randomUUID()
  }
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      polling.current?.abort()
      captures.current.forEach((p) => URL.revokeObjectURL(p.url))
    }
  }, [])
  useEffect(() => {
    camera.stop()
    captures.current.forEach((p) => URL.revokeObjectURL(p.url))
    change([])
    setNotice("")
  }, [caseId])
  async function add(files: File[]) {
    setBusy(true)
    setNotice("")
    const added: Capture[] = []
    try {
      for (const file of files) {
        if (captures.current.length + added.length >= 20)
          throw new Error(L("Maximum 20 capture pages.", "अधिकतम 20 पृष्ठ।"))
        if (
          !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
          file.size > 100 * 1024 * 1024
        )
          throw new Error(
            L(
              "Use PNG, JPEG or WebP under 100 MB.",
              "100 MB से कम PNG, JPEG या WebP उपयोग करें।",
            ),
          )
        const bitmap = await createImageBitmap(file),
          pixels = bitmap.width * bitmap.height
        bitmap.close()
        if (pixels > 16_000_000)
          throw new Error(
            L("Capture exceeds 16 megapixels.", "चित्र 16 मेगापिक्सेल से बड़ा है।"),
          )
        const hash = await browserSha256(file)
        added.push({
          key: crypto.randomUUID(),
          file,
          url: URL.createObjectURL(file),
          hash,
          corners: originalCorners(),
          rotation: 0,
        })
      }
      if (mounted.current) change([...captures.current, ...added])
      else added.forEach((p) => URL.revokeObjectURL(p.url))
    } catch (e) {
      if (mounted.current) {
        change([...captures.current, ...added])
        setNotice(e instanceof Error ? e.message : String(e))
      } else added.forEach((p) => URL.revokeObjectURL(p.url))
    } finally {
      if (mounted.current) setBusy(false)
    }
  }
  async function capture() {
    const video = camera.video.current
    if (!video?.videoWidth) return
    const canvas = document.createElement("canvas")
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext("2d")!.drawImage(video, 0, 0)
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.95),
    )
    if (blob)
      await add([
        new File([blob], `capture-${Date.now()}.jpg`, { type: "image/jpeg" }),
      ])
  }
  function edit(key: string, properties: Partial<Capture>) {
    change(
      captures.current.map((p) =>
        p.key === key ? { ...p, ...properties } : p,
      ),
    )
  }
  function move(index: number, direction: number) {
    const next = [...captures.current]
    ;[next[index], next[index + direction]] = [
      next[index + direction],
      next[index],
    ]
    change(next)
  }
  async function suggest(page: Capture) {
    setBusy(true)
    try {
      let id = page.evidenceId
      if (!id) {
        const existing = await api.listEvidence(caseId)
        id =
          existing.find(
            (item) => item.sha256 === page.hash && item.case_id === caseId,
          )?.id ||
          (
            await api.uploadEvidence(
              caseId,
              page.file,
              "Original scanner capture; automatic crop suggestion requested.",
            )
          ).id
        edit(page.key, { evidenceId: id })
      }
      const result = await api.scanCorners(id!)
      edit(page.key, { corners: result.corners })
      setNotice(
        result.suggested
          ? L(
              "Suggested corners applied. Check all four corners before assembly.",
              "सुझाए कोने लागू हुए। PDF बनाने से पहले चारों कोनों की जाँच करें।",
            )
          : L(
              "No clear document boundary found. Use manual corner coordinates.",
              "दस्तावेज़ सीमा नहीं मिली। कोने स्वयं निर्धारित करें।",
            ),
      )
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  async function download(page: Capture) {
    setBusy(true)
    try {
      const blob = await editedCapture(page.file, page.corners, page.rotation),
        url = URL.createObjectURL(blob),
        link = document.createElement("a")
      link.href = url
      link.download = `page-${pages.indexOf(page) + 1}-edited.png`
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setNotice(
        L(
          "Edited local derivative downloaded; original capture unchanged. Preview export is limited to 2 megapixels.",
          "संपादित स्थानीय फ़ाइल डाउनलोड हुई; मूल चित्र अपरिवर्तित है। पूर्वावलोकन निर्यात अधिकतम 2 मेगापिक्सेल है।",
        ),
      )
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  async function submit() {
    setBusy(true)
    camera.stop()
    setNotice("")
    try {
      const existing = await api.listEvidence(caseId)
      const sources = []
      for (const page of captures.current) {
        let id =
          page.evidenceId ||
          existing.find(
            (item) => item.sha256 === page.hash && item.case_id === caseId,
          )?.id
        if (!id) {
          const saved = await api.uploadEvidence(
            caseId,
            page.file,
            L(
              "Original document scanner capture; transforms are separate derivatives.",
              "मूल दस्तावेज़ स्कैन चित्र; बदलाव अलग व्युत्पन्न फ़ाइल में हैं।",
            ),
          )
          id = saved.id
          existing.push(saved)
        }
        page.evidenceId = id
        sources.push({
          evidence_id: id,
          transform: { rotation: page.rotation, corners: page.corners },
        })
        if (mounted.current) setPages([...captures.current])
      }
      const result = await api.submitScan(caseId, requestKey.current, sources)
      polling.current = new AbortController()
      setNotice(L(`Scan ${result.id}: queued.`, `स्कैन ${result.id}: कतार में।`))
      await waitForJob(
        result.jobId,
        (state) => {
          if (mounted.current)
            setNotice(
              L(
                `OCR ${result.jobId}: ${state}. Originals remain unchanged.`,
                `OCR ${result.jobId}: ${state}। मूल चित्र अपरिवर्तित हैं।`,
              ),
            )
        },
        polling.current.signal,
      )
      if (mounted.current) {
        setNotice(
          L(
            "Searchable PDF and OCR provenance saved. Open a source record to review or download.",
            "खोजने योग्य PDF और OCR स्रोत विवरण सहेजे गए। समीक्षा या डाउनलोड के लिए मूल रिकॉर्ड खोलें।",
          ),
        )
      }
    } catch (e) {
      if (mounted.current) setNotice(e instanceof Error ? e.message : String(e))
    } finally {
      if (mounted.current) setBusy(false)
    }
  }
  return (
    <section className="gov-panel p-5 space-y-4">
      <div className="flex justify-between flex-wrap gap-3">
        <h2 className="text-xl">
          {L("Document capture desk", "दस्तावेज़ स्कैन डेस्क")}
        </h2>
        <span className="gov-chip">{pages.length}/20</span>
      </div>
      <p className="text-sm">
        {L(
          "Capture or upload pages. Originals are preserved; crop coordinates and rotation apply only to derived PDFs. Use ordered corners: top-left, top-right, bottom-right, bottom-left.",
          "पृष्ठों का चित्र लें या अपलोड करें। मूल चित्र सुरक्षित रहते हैं; क्रॉप और घुमाव केवल व्युत्पन्न PDF पर लागू होते हैं। क्रम: ऊपर-बाएँ, ऊपर-दाएँ, नीचे-दाएँ, नीचे-बाएँ।",
        )}
      </p>
      <video
        ref={camera.video}
        muted
        playsInline
        className={camera.active ? "w-full max-h-80 bg-black" : "hidden"}
      />
      <div className="flex flex-wrap gap-3">
        <button
          className="btn-premium-outline"
          disabled={busy || camera.pending}
          onClick={camera.active ? camera.stop : camera.start}
        >
          {camera.pending
            ? L("Opening…", "खुल रहा है…")
            : camera.active
              ? L("Stop camera", "कैमरा बंद करें")
              : L("Start document camera", "दस्तावेज़ कैमरा शुरू करें")}
        </button>
        <button
          className="btn-premium"
          disabled={!camera.active || busy || pages.length >= 20}
          onClick={capture}
        >
          {L("Capture page", "पृष्ठ का चित्र लें")}
        </button>
        <label className="btn-premium-outline cursor-pointer">
          {L("Add page images", "पृष्ठ चित्र जोड़ें")}
          <input
            disabled={busy || pages.length >= 20}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={(e) => {
              add(Array.from(e.target.files || []))
              e.target.value = ""
            }}
          />
        </label>
      </div>
      {camera.error && (
        <p role="alert" className="text-sm">
          {L(
            camera.error,
            "कैमरा उपलब्ध नहीं। HTTPS / localhost या चित्र अपलोड उपयोग करें।",
          )}
        </p>
      )}
      {pages.map((page, index) => (
        <article
          className="border border-[var(--color-border-subtle)] p-4 space-y-3"
          key={page.key}
        >
          <div className="flex flex-wrap justify-between gap-3">
            <h3 className="font-mono text-sm">
              {index + 1}. {page.file.name}
            </h3>
            <div className="flex gap-3">
              <button
                disabled={busy || index === 0}
                onClick={() => move(index, -1)}
                aria-label={L("Move page up", "पृष्ठ ऊपर करें")}
              >
                ↑
              </button>
              <button
                disabled={busy || index === pages.length - 1}
                onClick={() => move(index, 1)}
                aria-label={L("Move page down", "पृष्ठ नीचे करें")}
              >
                ↓
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  URL.revokeObjectURL(page.url)
                  change(captures.current.filter((p) => p.key !== page.key))
                }}
              >
                {L("Remove", "हटाएँ")}
              </button>
            </div>
          </div>
          <div className="relative max-w-md mx-auto">
            <img
              src={page.url}
              alt={L("Original capture preview", "मूल चित्र पूर्वावलोकन")}
              className="w-full"
            />
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              <polygon
                points={page.corners
                  .map((p) => p.map((n) => n * 100).join(","))
                  .join(" ")}
                fill="rgba(255,153,51,.12)"
                stroke="#FF9933"
                strokeWidth=".5"
              />
            </svg>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {page.corners.map((point, corner) => (
              <div key={corner} className="text-xs">
                {L("Corner", "कोना")} {corner + 1}
                {point.map((value, axis) => (
                  <label key={axis} className="flex items-center gap-2 mt-1">
                    {axis === 0 ? "X" : "Y"}
                    <input
                      aria-label={`${L("Page", "पृष्ठ")} ${index + 1} ${L("corner", "कोना")} ${corner + 1} ${
                        axis === 0 ? "X" : "Y"
                      }`}
                      className="gov-input w-full min-w-0"
                      type="number"
                      min="0"
                      max="1"
                      step=".01"
                      disabled={busy}
                      value={value}
                      onChange={(e) => {
                        const corners = page.corners.map((p) => [...p])
                        corners[corner][axis] = Number(e.target.value)
                        edit(page.key, { corners })
                      }}
                    />
                  </label>
                ))}
              </div>
            ))}
          </div>
          <label className="block text-sm">
            {L("Clockwise rotation", "दक्षिणावर्त घुमाव")}{" "}
            <select
              className="gov-input"
              disabled={busy}
              value={page.rotation}
              onChange={(e) =>
                edit(page.key, { rotation: Number(e.target.value) })
              }
            >
              {[0, 90, 180, 270].map((n) => (
                <option key={n} value={n}>
                  {n}°
                </option>
              ))}
            </select>
          </label>
          <button
            className="btn-premium-outline"
            disabled={busy || appMode !== "full"}
            title={
              appMode !== "full"
                ? L(
                    "Local secure service required",
                    "स्थानीय सुरक्षित सेवा आवश्यक है",
                  )
                : undefined
            }
            onClick={() => suggest(page)}
          >
            {L("Save original & suggest crop", "मूल सहेजें और क्रॉप सुझाव लें")}
          </button>
          <button
            className="btn-premium-outline"
            disabled={busy}
            onClick={() => download(page)}
          >
            {L("Download edited page", "संपादित पृष्ठ डाउनलोड करें")}
          </button>
          <p className="font-mono text-[10px] break-all">
            {L(
              "Browser SHA-256 (server rehashes originals)",
              "ब्राउज़र SHA-256 (सर्वर मूल चित्र का नया हैश बनाएगा)",
            )}
            : {page.hash}
          </p>
          {page.evidenceId ? (
            <button
              className="underline text-sm"
              onClick={() => onEvidence(page.evidenceId!)}
            >
              {L("Open saved source record", "सहेजा मूल रिकॉर्ड खोलें")}
            </button>
          ) : null}
        </article>
      ))}
      <button
        disabled={busy || !pages.length || appMode !== "full"}
        title={
          appMode !== "full"
            ? L("Local secure service required", "स्थानीय सुरक्षित सेवा आवश्यक है")
            : undefined
        }
        className="btn-premium"
        onClick={submit}
      >
        {busy
          ? L("Processing…", "प्रक्रिया जारी…")
          : L(
              "Preserve originals, assemble PDF & OCR",
              "मूल सहेजें, PDF और OCR बनाएँ",
            )}
      </button>
      {appMode !== "full" && (
        <p className="text-sm">
          {L(
            "Showcase: capture, local crop download and browser hashing only. Local secure service required for persistence, PDF assembly and OCR.",
            "प्रदर्शन: केवल चित्र और ब्राउज़र हैश। सहेजने, PDF और OCR के लिए स्थानीय सेवा आवश्यक है।",
          )}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm break-all">
          {notice}
        </p>
      )}
    </section>
  )
}
