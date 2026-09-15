import { useEffect, useRef, useState } from "react"
import { BrowserQRCodeReader, IScannerControls } from "@zxing/browser"
import { useLocale } from "../context/LocaleContext"
import { verificationToken } from "../lib/scanner"
import useCamera from "./useCamera"
export default function QRScanner({
  onToken,
}: {
  onToken: (token: string) => void
}) {
  const { locale } = useLocale(),
    camera = useCamera(),
    controls = useRef<IScannerControls | null>(null),
    alive = useRef(true),
    generation = useRef(0)
  const L = (en: string, hi: string) => (locale === "hi" ? hi : en)
  const [manual, setManual] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false)
  function stop() {
    generation.current++
    controls.current?.stop()
    controls.current = null
    camera.stop()
  }
  function accept(value: string) {
    try {
      const token = verificationToken(value)
      stop()
      setError("")
      onToken(token)
    } catch (e) {
      setError(
        L(
          e instanceof Error ? e.message : "Invalid QR.",
          "यह मान्य डिसाइफ़र सत्यापन QR या टोकन नहीं है।",
        ),
      )
    }
  }
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      generation.current++
      controls.current?.stop()
    }
  }, [])
  async function start() {
    stop()
    setError("")
    const request = generation.current,
      stream = await camera.start()
    if (!stream || request !== generation.current) return
    try {
      const result = await new BrowserQRCodeReader().decodeFromStream(
        stream,
        camera.video.current!,
        (result) => {
          if (result && alive.current && request === generation.current)
            accept(result.getText())
        },
      )
      if (!alive.current || request !== generation.current) result.stop()
      else controls.current = result
    } catch {
      stop()
      setError(
        L(
          "QR camera could not start. Upload an image or paste the token.",
          "QR कैमरा शुरू नहीं हुआ। चित्र या टोकन उपयोग करें।",
        ),
      )
    }
  }
  async function upload(file?: File) {
    if (!file) return
    setBusy(true)
    setError("")
    let url = ""
    try {
      if (!file.type.startsWith("image/") || file.size > 20 * 1024 * 1024)
        throw new Error("Image limit exceeded.")
      const bitmap = await createImageBitmap(file),
        pixels = bitmap.width * bitmap.height
      bitmap.close()
      if (pixels > 16_000_000) throw new Error("Pixel limit exceeded.")
      url = URL.createObjectURL(file)
      const result = await new BrowserQRCodeReader().decodeFromImageUrl(url)
      if (alive.current) accept(result.getText())
    } catch {
      if (alive.current)
        setError(
          L(
            "No acceptable QR found. Use a clearer image (max 20 MB / 16 MP) or paste the token.",
            "मान्य QR नहीं मिला। साफ़ चित्र (अधिकतम 20 MB / 16 MP) या टोकन उपयोग करें।",
          ),
        )
    } finally {
      if (url) URL.revokeObjectURL(url)
      if (alive.current) setBusy(false)
    }
  }
  return (
    <section className="gov-panel p-5 space-y-4">
      <h2 className="text-xl">{L("Scan evidence QR", "साक्ष्य QR स्कैन करें")}</h2>
      <p className="text-sm">
        {L(
          "A QR identifies evidence; it does not prove integrity.",
          "QR साक्ष्य पहचानता है; अखंडता सिद्ध नहीं करता।",
        )}
      </p>
      <video
        ref={camera.video}
        muted
        playsInline
        className={camera.active ? "w-full max-h-72 bg-black" : "hidden"}
      />
      <div className="flex flex-wrap gap-3">
        <button
          className="btn-premium-outline"
          disabled={camera.pending}
          onClick={camera.active ? stop : start}
        >
          {camera.pending
            ? L("Opening…", "खुल रहा है…")
            : camera.active
              ? L("Stop camera", "कैमरा बंद करें")
              : L("Start QR camera", "QR कैमरा शुरू करें")}
        </button>
        <label className="btn-premium-outline cursor-pointer">
          {busy
            ? L("Reading…", "पढ़ा जा रहा है…")
            : L("Upload QR image", "QR चित्र अपलोड करें")}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              upload(e.target.files?.[0])
              e.target.value = ""
            }}
          />
        </label>
      </div>
      <form
        className="flex flex-wrap gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          accept(manual)
        }}
      >
        <input
          className="gov-input flex-1 min-w-0"
          value={manual}
          maxLength={512}
          onChange={(e) => setManual(e.target.value)}
          aria-label={L("Verification token or link", "सत्यापन टोकन या लिंक")}
          placeholder={L(
            "Paste verification token or link",
            "सत्यापन टोकन या लिंक डालें",
          )}
        />
        <button className="btn-premium" disabled={!manual.trim()}>
          {L("Open identity", "पहचान खोलें")}
        </button>
      </form>
      {(error || camera.error) && (
        <p role="alert" className="text-sm">
          {error ||
            L(
              camera.error,
              "कैमरा उपलब्ध नहीं। HTTPS / localhost या चित्र अपलोड उपयोग करें।",
            )}
        </p>
      )}
    </section>
  )
}
