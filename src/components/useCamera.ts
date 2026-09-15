import { useEffect, useRef, useState } from "react"
export default function useCamera() {
  const video = useRef<HTMLVideoElement>(null),
    current = useRef<MediaStream | null>(null),
    generation = useRef(0)
  const [active, setActive] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState("")
  function stop() {
    generation.current++
    current.current?.getTracks().forEach((t) => t.stop())
    current.current = null
    if (video.current) video.current.srcObject = null
    setActive(false)
    setPending(false)
  }
  async function start() {
    stop()
    setError("")
    setPending(true)
    const request = generation.current
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "Camera needs HTTPS or localhost. Use image upload instead.",
        )
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      })
      if (request !== generation.current) {
        stream.getTracks().forEach((t) => t.stop())
        return null
      }
      current.current = stream
      if (video.current) {
        video.current.srcObject = stream
        await video.current.play()
      }
      if (request !== generation.current) {
        stream.getTracks().forEach((t) => t.stop())
        return null
      }
      setActive(true)
      return stream
    } catch (e) {
      if (request === generation.current) {
        stop()
        setError(
          e instanceof Error
            ? e.message
            : "Camera unavailable. Use image upload.",
        )
      }
      return null
    } finally {
      if (request === generation.current) setPending(false)
    }
  }
  useEffect(
    () => () => {
      generation.current++
      current.current?.getTracks().forEach((t) => t.stop())
    },
    [],
  )
  return { video, active, pending, error, start, stop }
}
