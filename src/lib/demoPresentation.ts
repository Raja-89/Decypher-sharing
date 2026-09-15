import type { CaseEdge, CaseNode } from "./caseData"
import type { EntityType, GraphEdge, GraphNode } from "../data/dummy"

export const richNightfallId = "CASE-SYN-d19a0c50df-NIGHTFALL"

// Only the known validation naming AND descriptions are treated as test records.
// This affects presentation, never permissions, storage or direct links.
export function isValidationCase(c: { title?: string description?: string }) {
  return (
    (/^Synthetic browser audit (desktop|mobile) \d+$/.test(c.title || "") &&
      c.description ===
        "Synthetic isolated case for browser control validation only.") ||
    (/^Synthetic scanner audit [a-f0-9]{12}$/.test(c.title || "") &&
      (c.description || "").startsWith(
        "Isolated fictional audit case for real local MinIO",
      ))
  )
}

export function isStagedMedia(e: { id: string mime_type: string }) {
  return (
    /^(image|audio|video)\//.test(e.mime_type) &&
    (e.id.startsWith("EV-SYN-") ||
      ["EV-2026-0004", "EV-2026-0005", "EV-2026-0006"].includes(e.id))
  )
}

// Coalesce repeated occurrence edges for readable rendering; original events and
// citations remain in the case snapshot/inspector. Direction and type are retained.
export function knowledgeGraph(
  nodes: CaseNode[],
  edges: CaseEdge[],
  locale: string,
) {
  const ids = new Set(nodes.map((n) => n.id))
  const groups = new Map<string, CaseEdge[]>()
  for (const edge of edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) continue
    const key = JSON.stringify([edge.source, edge.type, edge.target])
    groups.set(key, [...(groups.get(key) || []), edge])
  }
  const sorted = [...nodes].sort(
    (a, b) =>
      edges.filter((e) => e.source === b.id || e.target === b.id).length -
        edges.filter((e) => e.source === a.id || e.target === a.id).length ||
      a.id.localeCompare(b.id),
  )
  const graphNodes: GraphNode[] = sorted.map((n, i) => {
    const ring = i === 0 ? 0 : i <= 8 ? 1 : 2
    const offset = ring === 1 ? i - 1 : i - 9
    const count =
      ring === 1
        ? Math.min(8, sorted.length - 1)
        : Math.max(1, sorted.length - 9)
    const angle = (2 * Math.PI * offset) / count - Math.PI / 2
    return {
      id: n.id,
      label: locale === "hi" ? n.labelHi || n.label : n.label,
      type: (n.type === "ORGANIZATION"
        ? "org"
        : n.type.toLowerCase()) as EntityType,
      x: 400 + (ring === 0 ? 0 : ring === 1 ? 165 : 315) * Math.cos(angle),
      y: 290 + (ring === 0 ? 0 : ring === 1 ? 135 : 235) * Math.sin(angle),
      data: { ...n.properties, evidenceCount: n.evidenceIds.length },
    }
  })
  const graphEdges: GraphEdge[] = [...groups.entries()].map(
    ([id, records]) => ({
      id,
      source: records[0].source,
      target: records[0].target,
      label:
        records[0].type + (records.length > 1 ? ` ×${records.length}` : ""),
      confidence: Math.min(...records.map((e) => e.confidence)),
      evidenceIds: [...new Set(records.flatMap((e) => e.evidenceIds))],
    }),
  )
  return { graphNodes, graphEdges }
}
