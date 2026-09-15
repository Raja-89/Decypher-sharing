// @vitest-environment jsdom
import { afterEach, it, expect, vi } from "vitest"
import { renderHook, act, cleanup } from "@testing-library/react"
import useCamera from "./useCamera"
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
it("stops every camera track on unmount", async () => {
  const stop = vi.fn(),
    stream = { getTracks: () => [{ stop }] }
  Object.defineProperty(window, "isSecureContext", {
    value: true,
    configurable: true,
  })
  Object.defineProperty(navigator, "mediaDevices", {
    value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    configurable: true,
  })
  const hook = renderHook(() => useCamera())
  await act(async () => {
    await hook.result.current.start()
  })
  expect(hook.result.current.active).toBe(true)
  hook.unmount()
  expect(stop).toHaveBeenCalledOnce()
})
it("stops a permission result arriving after cancellation", async () => {
  const stop = vi.fn()
  let resolve: (value: unknown) => void
  Object.defineProperty(window, "isSecureContext", {
    value: true,
    configurable: true,
  })
  Object.defineProperty(navigator, "mediaDevices", {
    value: {
      getUserMedia: vi.fn(
        () =>
          new Promise((r) => {
            resolve = r
          }),
      ),
    },
    configurable: true,
  })
  const hook = renderHook(() => useCamera())
  let request: Promise<unknown>
  act(() => {
    request = hook.result.current.start()
  })
  act(() => hook.result.current.stop())
  await act(async () => {
    resolve({ getTracks: () => [{ stop }] })
    await request
  })
  expect(stop).toHaveBeenCalledOnce()
  expect(hook.result.current.active).toBe(false)
})
