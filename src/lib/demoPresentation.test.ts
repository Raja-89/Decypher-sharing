import { describe, expect, it } from "vitest"
import {
  isValidationCase,
  isStagedMedia,
  knowledgeGraph,
} from "./demoPresentation"
describe("judging presentation", () => {
  it("separates exact known audits without hiding similarly named investigations", () => {
    expect(
      isValidationCase({
        title: "Synthetic browser audit desktop 123",
        description:
          "Synthetic isolated case for browser control validation only.",
      }),
    ).toBe(true)
    expect(
      isValidationCase({
        title: "Synthetic browser audit desktop 123",
        description: "An actual investigator-created story",
      }),
    ).toBe(false)
    expect(isValidationCase({ title: "Operation Nightfall" })).toBe(false)
  })
  it("labels fixture media without mislabelling investigator uploads", () => {
    expect(isStagedMedia({ id: "EV-SYN-ONE", mime_type: "audio/wav" })).toBe(
      true,
    )
    expect(isStagedMedia({ id: "EV-upload", mime_type: "audio/wav" })).toBe(
      false,
    )
  })
  it("coalesces occurrences without losing direction, type or supporting evidence", () => {
    const nodes = ["a", "b"].map((id) => ({
      id,
      label: id,
      type: "PERSON",
      properties: {},
      evidenceIds: ["e1"],
    }))
    const edge = {
      id: "1",
      source: "a",
      target: "b",
      type: "CALLED",
      confidence: 0.9,
      evidenceIds: ["e1"],
      timestamp: "2026-09-14",
    }
    const graph = knowledgeGraph(
      nodes,
      [
        edge,
        { ...edge, id: "2", evidenceIds: ["e2"] },
        { ...edge, id: "3", source: "b", target: "a" },
      ],
      "en",
    )
    expect(
      graph.graphNodes.every(
        (n) => n.x >= 0 && n.x <= 800 && n.y >= 0 && n.y <= 600,
      ),
    ).toBe(true)
    expect(graph.graphEdges).toHaveLength(2)
    expect(graph.graphEdges[0].label).toBe("CALLED ×2")
    expect(graph.graphEdges[0].evidenceIds).toEqual(["e1", "e2"])
  })
})
