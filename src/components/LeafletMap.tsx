import { useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Tooltip, Circle, Polyline } from "react-leaflet";
import L from "leaflet";
import { mapLocations } from "../data/dummy";
import { PALETTE } from "../theme";
import {useLocale} from "../context/LocaleContext";

// Fix default marker icons
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// Map-location significance (not entity type) -> restrained institutional tones.
const MARKER_COLORS: Record<string, string> = {
  primary: PALETTE.primary,
  secondary: PALETTE.accent,
  peripheral: PALETTE.textMuted,
  alert: PALETTE.critical,
};
const MARKER_LABEL: Record<string, string> = {
  primary: "Primary node",
  secondary: "Secondary node",
  peripheral: "Peripheral",
  alert: "Active alert",
};
const MARKER_ORDER = ["primary", "secondary", "peripheral", "alert"];

function createColoredIcon(color: string) {
  return L.divIcon({
    html: `<div style="width:14px;height:14px;background:${color};border:2px solid #fbfcfd;border-radius:50%;outline:1px solid rgba(20,24,31,0.3);"></div>`,
    className: "",
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    popupAnchor: [0, -10],
  });
}

// Inter-city links. Alert routes carry the critical tone; the rest are steel-blue.
const CONNECTIONS: { from: [number, number]; to: [number, number]; color: string; weight: number; opacity: number; dash: string }[] = [
  { from: [28.6315, 77.2167], to: [28.4595, 77.0266], color: PALETTE.accent, weight: 2, opacity: 0.85, dash: "6,6" },
  { from: [28.4595, 77.0266], to: [28.6270, 77.3723], color: PALETTE.critical, weight: 2, opacity: 0.85, dash: "6,6" },
  { from: [28.6315, 77.2167], to: [28.6129, 77.2295], color: PALETTE.borderStrong, weight: 1.5, opacity: 0.65, dash: "4,4" },
];

interface Props {
  height?: number;
  showConnections?: boolean;
  locations?: Array<(typeof mapLocations)[number]&{evidenceIds?:string[]}>;
  onEvidenceClick?: (id:string)=>void;
}

export default function LeafletMap({ height = 440, showConnections = true, locations = mapLocations,onEvidenceClick }: Props) {
  const {locale}=useLocale();const L=(en:string,hi:string)=>locale==="hi"?hi:en;
  const center: [number, number] = [28.58, 77.20]; // Operation Nightfall, Delhi NCR
  const indiaBounds: L.LatLngBoundsExpression = [
    [6.5, 68.0],
    [35.5, 97.5],
  ];

  const presentTypes = useMemo(() => MARKER_ORDER.filter((t) => locations.some((l) => l.type === t)), [locations]);
  const [activeTypes, setActiveTypes] = useState<Set<string>>(() => new Set(MARKER_ORDER));
  const [showConn, setShowConn] = useState(showConnections);
  const [showFences, setShowFences] = useState(true);
  const [tileError, setTileError] = useState(false);

  const toggleType = (t: string) =>
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });

  const visibleLocations = locations.filter((l) => activeTypes.has(l.type));
  const stats = useMemo(
    () => ({
      total: locations.length,
      alerts: locations.filter((l) => l.type === "alert").length,
      primary: locations.filter((l) => l.type === "primary").length,
    }),
    [locations]
  );

  return (
    <div className="overflow-hidden border border-[var(--color-border-strong)] relative" style={{ height }}>
      {/* Stat overlay (derived from data) */}
      <div className="absolute top-3 right-3 z-[400] pointer-events-none max-w-[calc(100%_-_60px)]">
        <div className="px-3.5 py-2 bg-[var(--color-surface)] border border-[var(--color-border-strong)] rounded-sm flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[var(--color-primary)]" />
            <span className="text-[11px] font-semibold text-[var(--color-text-primary)]">{stats.total} {L("locations","स्थान")}</span>
          </div>
          <span className="text-[var(--color-border-strong)]">|</span>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[var(--color-alert-critical)]" />
            <span className="text-[11px] font-semibold text-[var(--color-alert-critical)]">{stats.alerts} {L("active alerts","सक्रिय संकेत")}</span>
          </div>
          <span className="text-[var(--color-border-strong)]">|</span>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[var(--color-accent)]" />
            <span className="text-[11px] font-semibold text-[var(--color-text-secondary)]">{stats.primary} {L("key locations","मुख्य स्थान")}</span>
          </div>
        </div>
      </div>

      {/* Legend + filters */}
      <div className="absolute bottom-3 left-3 z-[400] bg-[var(--color-surface)] border border-[var(--color-border-subtle)] rounded-sm p-2.5 max-w-[210px]">
        <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">{L("Map layers","मानचित्र परतें")}</div>
        <div className="flex flex-col gap-1 mb-2">
          {presentTypes.map((t) => {
            const on = activeTypes.has(t);
            return (
              <button
                key={t}
                onClick={() => toggleType(t)}
                aria-pressed={on}
                className="flex items-center gap-2 text-left px-1 py-0.5 rounded-sm hover:bg-[var(--color-surface-hover)] transition-colors"
                style={{ opacity: on ? 1 : 0.45 }}
              >
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 border border-[var(--color-surface)]" style={{ background: MARKER_COLORS[t], outline: "1px solid rgba(20,24,31,0.25)" }} />
                <span className="text-[11px] text-[var(--color-text-secondary)] font-medium">{L(MARKER_LABEL[t],({primary:"मुख्य स्थान",secondary:"अन्य स्थान",peripheral:"परिधीय स्थान",alert:"सक्रिय संकेत"} as Record<string,string>)[t])}</span>
              </button>
            );
          })}
        </div>
        <div className="border-t border-[var(--color-border-subtle)] pt-1.5 flex flex-col gap-1">
          <button disabled={!showConnections} title={!showConnections?L("No evidence-backed route geometry is available for this case.","इस केस में साक्ष्य-समर्थित मार्ग उपलब्ध नहीं है।"):undefined} onClick={() => setShowConn((v) => !v)} aria-pressed={showConn} className="flex items-center gap-2 text-left px-1 py-0.5 rounded-sm hover:bg-[var(--color-surface-hover)]" style={{ opacity: showConn ? 1 : 0.45 }}>
            <span className="w-2.5 h-0.5 flex-shrink-0" style={{ background: PALETTE.accent }} />
            <span className="text-[11px] text-[var(--color-text-secondary)] font-medium">{L("Connections","मार्ग संबंध")}</span>
          </button>
          <button title={L("45 km orientation circles, not evidence-derived geofences.","45 किमी संदर्भ वृत्त, साक्ष्य-आधारित सीमाएँ नहीं।")} onClick={() => setShowFences((v) => !v)} aria-pressed={showFences} className="flex items-center gap-2 text-left px-1 py-0.5 rounded-sm hover:bg-[var(--color-surface-hover)]" style={{ opacity: showFences ? 1 : 0.45 }}>
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 border border-dashed" style={{ borderColor: PALETTE.primary }} />
            <span className="text-[11px] text-[var(--color-text-secondary)] font-medium">{L("Orientation circles","संदर्भ वृत्त")}</span>
          </button>
        </div>
      </div>

      <MapContainer
        center={center}
        zoom={9}
        maxBounds={indiaBounds}
        maxBoundsViscosity={1.0}
        minZoom={5}
        style={{ height: "100%", width: "100%", background: "var(--color-base-bg)" }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          // Leaflet fires `load` even when every tile failed. Keep the failure
          // notice for this mounted view; refresh/case change retries cleanly.
          eventHandlers={{ tileerror: () => setTileError(true) }}
        />

        {/* Connection lines */}
        {showConnections && showConn &&
          CONNECTIONS.map((c, i) => (
            <Polyline key={i} positions={[c.from, c.to]} pathOptions={{ color: c.color, weight: c.weight, opacity: c.opacity, dashArray: c.dash }} />
          ))}

        {/* Markers */}
        {visibleLocations.map((loc) => (
          <Marker key={loc.id} title={loc.name} alt={loc.name} position={[loc.lat, loc.lng]} icon={createColoredIcon(MARKER_COLORS[loc.type] || PALETTE.textMuted)}>
            <Tooltip permanent direction="top" offset={[0, -8]} className="cypher-map-tooltip">
              <div className="flex items-center gap-1 font-mono text-[10px]">
                <span className="font-bold">{loc.name}</span>
                <span className="opacity-70">({loc.entity})</span>
              </div>
            </Tooltip>

            <Popup className="cypher-popup">
              <div style={{ minWidth: 160, fontFamily: "var(--font-sans)", padding: "4px" }}>
                <div style={{ fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 4, fontSize: 13 }}>{loc.name}</div>
                <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginBottom: 6, fontFamily: "var(--font-mono)" }}>{loc.id}</div>
                <div style={{ fontSize: 12, color: "var(--color-text-secondary)",whiteSpace:"pre-wrap",maxHeight:160,overflowY:"auto" }}>{loc.description}</div>
                {onEvidenceClick&&<div className="flex flex-wrap gap-1 mt-2">{loc.evidenceIds?.map(id=><button key={id} className="gov-chip text-[10px]" onClick={()=>onEvidenceClick(id)}>{id}</button>)}</div>}
                <div style={{ marginTop: 8, fontSize: 11, color: MARKER_COLORS[loc.type], fontWeight: 600 }}>Entity: {loc.entity}</div>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Geofence circles for primary + alert locations */}
        {showFences &&
          visibleLocations
            .filter((l) => l.type === "primary" || l.type === "alert")
            .map((loc) => (
              <Circle
                key={`circle-${loc.id}`}
                center={[loc.lat, loc.lng]}
                radius={45000}
                pathOptions={{ color: MARKER_COLORS[loc.type], fillColor: MARKER_COLORS[loc.type], fillOpacity: 0.1, weight: 1, dashArray: "4,4" }}
              />
            ))}
      </MapContainer>
      {tileError && <div role="status" className="absolute top-3 left-1/2 -translate-x-1/2 z-[500] bg-[var(--color-surface)] border border-[var(--color-alert-medium)] px-3 py-2 text-[11px] text-[var(--color-text-secondary)]">{L("Map tiles are unavailable. Location evidence remains available in the location list.","मानचित्र टाइल उपलब्ध नहीं हैं। स्थान साक्ष्य सूची में उपलब्ध हैं।")}</div>}
    </div>
  );
}
