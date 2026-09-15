// @vitest-environment jsdom
import { afterEach, it, expect, vi } from "vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { LocaleProvider } from "../context/LocaleContext"
import QRScanner from "./QRScanner"
vi.mock("@zxing/browser", () => ({ BrowserQRCodeReader: class {} }))
afterEach(() => {
  cleanup()
  localStorage.clear()
})
it("manual fallback navigates by validated token only", () => {
  const onToken = vi.fn()
  render(
    <LocaleProvider>
      <QRScanner onToken={onToken} />
    </LocaleProvider>,
  )
  fireEvent.change(screen.getByLabelText("Verification token or link"), {
    target: { value: "opaque_verification_token_12345" },
  })
  fireEvent.click(screen.getByRole("button", { name: "Open identity" }))
  expect(onToken).toHaveBeenCalledWith("opaque_verification_token_12345")
})
it("rejects external QR links visibly", () => {
  const onToken = vi.fn()
  render(
    <LocaleProvider>
      <QRScanner onToken={onToken} />
    </LocaleProvider>,
  )
  fireEvent.change(screen.getByLabelText("Verification token or link"), {
    target: {
      value: "https://evil.example/verify/opaque_verification_token_12345",
    },
  })
  fireEvent.click(screen.getByRole("button", { name: "Open identity" }))
  expect(onToken).not.toHaveBeenCalled()
  expect(screen.getByRole("alert").textContent).toContain("External")
})
it("renders Hindi controls from the shared persisted locale", () => {
  localStorage.setItem("ui.lang", "hi")
  render(
    <LocaleProvider>
      <QRScanner onToken={vi.fn()} />
    </LocaleProvider>,
  )
  expect(screen.getByRole("button", { name: "QR कैमरा शुरू करें" })).toBeTruthy()
})
