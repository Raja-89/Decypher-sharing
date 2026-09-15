// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { verificationToken } from "./scanner"
describe("untrusted verification QR payloads", () => {
  const token = "opaque_verification_token_12345",
    origin = "http://localhost:8443"
  it("accepts opaque tokens and configured identity links", () => {
    expect(verificationToken(token, origin)).toBe(token)
    expect(verificationToken(`${origin}/verify/${token}`, origin)).toBe(token)
    expect(
      verificationToken(
        `https://decypher.example/verify/${token}`,
        origin,
        "https://decypher.example",
      ),
    ).toBe(token)
  })
  it.each([
    "https://evil.example/verify/opaque_verification_token_12345",
    "javascript:alert(1)",
    "file:///etc/passwd",
    "http://localhost:8443/dashboard",
    "http://localhost:8443/verify/short",
    "http://localhost:8443/verify/opaque_verification_token_12345?next=https://evil.example",
    "http://user:pass@localhost:8443/verify/opaque_verification_token_12345",
    "http://localhost:8443/verify/%2Fetc%2Fpasswd",
  ])("rejects unsafe identity payload %s", (payload) => {
    expect(() => verificationToken(payload, origin)).toThrow()
  })
})
