import { useState, useEffect } from "react";
import { apiFetch } from "./api";
import {
  MapPin,
  Battery,
  Wifi,
  Phone,
  MessageSquare,
  Activity,
  CircleAlert,
  ShieldAlert,
  Lock,
  Key,
  AlertCircle,
  X,
  ExternalLink,
  ChevronRight,
  Smartphone,
  ShieldCheck,
  CreditCard,
  Shield,
} from "lucide-react";
import iphoneMockup from "./assets/iphone_mockup.png";

const PROFILE_ID = "default";
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

function timeAgo(ts) {
  const t = new Date(ts).getTime();
  if (!ts || isNaN(t)) return "—";
  const d = Date.now() - t;
  const m = Math.floor(d / 60000);
  const h = Math.floor(d / 3600000);
  if (m < 1) return "Az önce";
  if (m < 60) return `${m}dk`;
  return `${h}s`;
}

const EVENT_ICON = {
  message: MessageSquare,
  call: Phone,
  location: MapPin,
  risk_event: ShieldAlert,
};
const EVENT_COLOR = {
  message: "text-blue-400",
  call: "text-emerald-400",
  location: "text-amber-400",
  risk_event: "text-red-400",
};
const RISK_DOT = {
  high: "bg-red-500",
  medium: "bg-amber-500",
  low: "bg-yellow-400",
};

export default function DashboardView() {
  const [alerts, setAlerts] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [dismissed, setDismissed] = useState(false);
  const [health, setHealth] = useState(null);
  const [topContacts, setTopContacts] = useState([]);
  const [locationHistory, setLocationHistory] = useState([]);
  const [diagnostics, setDiagnostics] = useState(null);
  const [comingSoon, setComingSoon] = useState(false);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const [ar, tr, cr, hr, contacts, lh, diag] = await Promise.all([
          apiFetch(`${API_BASE}/api/alerts/${PROFILE_ID}`).then((r) =>
            r.ok ? r.json() : null,
          ),
          apiFetch(`${API_BASE}/api/timeline/${PROFILE_ID}?limit=5`).then(
            (r) => (r.ok ? r.json() : null),
          ),
          apiFetch(`${API_BASE}/api/comms/${PROFILE_ID}/summary`).then((r) =>
            r.ok ? r.json() : null,
          ),
          apiFetch(`${API_BASE}/health`).then((r) => (r.ok ? r.json() : null)),
          apiFetch(`${API_BASE}/api/contacts/${PROFILE_ID}/map?limit=3`).then(
            (r) => (r.ok ? r.json() : []),
          ),
          apiFetch(
            `${API_BASE}/api/location_history/${PROFILE_ID}?limit=3`,
          ).then((r) => (r.ok ? r.json() : [])),
          apiFetch(`${API_BASE}/api/diagnostics/${PROFILE_ID}`).then((r) =>
            r.ok ? r.json() : null,
          ),
        ]);
        if (!alive) return;
        const base = Array.isArray(ar) ? ar : [];
        const commsAlerts = Array.isArray(cr) ? cr : [];
        const merged = [...base];
        for (const ca of commsAlerts) {
          if (!merged.find((a) => a.id === ca.id)) merged.push(ca);
        }
        setAlerts(merged);
        if (Array.isArray(tr)) setTimeline(tr);
        if (hr) setHealth(hr);
        if (Array.isArray(lh) && lh.length) setLocationHistory(lh.slice(0, 3));
        if (contacts?.length) {
          const sorted = [...contacts].sort(
            (a, b) => b.message_count - a.message_count,
          );
          setTopContacts(sorted.slice(0, 3));
        }
        if (Array.isArray(diag) && diag.length) setDiagnostics(diag[0]);
        else if (diag && !Array.isArray(diag)) setDiagnostics(diag);
      } catch {
        /* use mock */
      }
    }
    load();
    const t = setInterval(load, 30000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const highAlerts = alerts.filter((a) => a.level === "high");
  const mediumAlerts = alerts.filter((a) => a.level === "medium");

  return (
    <div className="h-full overflow-y-auto custom-scrollbar p-6 pb-20 space-y-6 animate-in fade-in duration-700">
      {comingSoon && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setComingSoon(false)}
        >
          <div
            className="bg-zinc-900 border border-zinc-700 rounded-2xl p-8 text-center shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-zinc-100 font-black text-sm uppercase tracking-widest mb-2">
              Bu özellik yakında geliyor
            </p>
            <p className="text-zinc-500 text-xs mb-6">Henüz aktif değil.</p>
            <button
              onClick={() => setComingSoon(false)}
              className="px-6 py-2 bg-zinc-800 text-zinc-300 text-xs font-black rounded-xl hover:bg-zinc-700 transition-colors uppercase tracking-wider"
            >
              Kapat
            </button>
          </div>
        </div>
      )}
      {/* ── SAFETY ALERT BANNER ────────────────────────────────────────── */}
      {!dismissed && highAlerts.length > 0 && (
        <div className="rounded-2xl overflow-hidden shadow-2xl shadow-red-500/10 border border-red-500/20 bg-zinc-900/50 backdrop-blur-md">
          <div className="bg-gradient-to-r from-red-600 to-rose-700 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center shrink-0 border border-white/20">
                <ShieldAlert className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-white font-black text-sm uppercase tracking-tighter">
                  Kritik Güvenlik Uyarısı — {highAlerts.length} Olay
                </p>
                <p className="text-red-100 text-[11px] font-medium">
                  Cihaz üzerinde şüpheli aktiviteler tespit edildi
                </p>
              </div>
            </div>
            <button
              onClick={() => setDismissed(true)}
              className="text-white/40 hover:text-white transition-all hover:bg-white/10 p-2 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="divide-y divide-red-500/10">
            {highAlerts.map((a) => (
              <div
                key={a.id}
                className="px-6 py-4 flex items-center gap-5 hover:bg-red-500/5 transition-colors group"
              >
                <div className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0 shadow-[0_0_10px_rgba(239,68,68,0.5)] animate-pulse" />
                <div className="flex-1">
                  <p className="text-sm font-bold text-zinc-100 group-hover:text-red-400 transition-colors">
                    {a.title}
                  </p>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {a.description}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-[10px] font-black text-red-400 bg-red-400/10 px-2.5 py-1 rounded-full uppercase tracking-wider border border-red-400/20">
                    {a.source}
                  </span>
                  <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest">
                    {a.count} ADET
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Medium-severity alert chips ──────────────────────────────────── */}
      {mediumAlerts.length > 0 && (
        <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
          {mediumAlerts.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-3 bg-zinc-900/50 border border-amber-500/20 rounded-xl px-5 py-3 shrink-0 backdrop-blur-sm hover:border-amber-500/40 transition-colors"
            >
              <div className="w-8 h-8 bg-amber-500/10 rounded-lg flex items-center justify-center border border-amber-500/20">
                <AlertCircle className="w-4 h-4 text-amber-500" />
              </div>
              <div>
                <p className="text-[11px] font-black text-zinc-200 uppercase tracking-tight">
                  {a.title}
                </p>
                <p className="text-[10px] text-zinc-500 font-medium">
                  {a.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Main Dashboard Grid ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Anlık Aktivite (Live Stream Aesthetic) */}
        <div className="bg-zinc-900/40 rounded-2xl border border-zinc-800/60 p-6 flex flex-col backdrop-blur-sm">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-[15px] font-black text-zinc-200 flex items-center gap-2 uppercase tracking-tight">
              <Activity className="w-4 h-4 text-[#00a2ff]" />
              Canlı Yayın Akışı
            </h2>
            <div className="flex items-center gap-2 bg-blue-500/10 px-2 py-1 rounded-full border border-blue-500/20">
              <div className="w-1.5 h-1.5 bg-[#00a2ff] rounded-full animate-pulse" />
              <span className="text-[9px] text-[#00a2ff] font-black uppercase tracking-widest">
                CANLI
              </span>
            </div>
          </div>

          <div className="space-y-3 flex-1 overflow-y-auto custom-scrollbar pr-2">
            {timeline.map((ev) => {
              const IconComp = EVENT_ICON[ev.type] || Activity;
              return (
                <div
                  key={`${ev.ts}-${ev.title}`}
                  className={`group flex items-start gap-4 p-3 rounded-xl transition-all border ${
                    ev.is_deleted
                      ? "bg-red-500/5 border-red-500/20"
                      : "bg-zinc-800/30 border-transparent hover:border-zinc-700 hover:bg-zinc-800/50"
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border transition-all ${
                      ev.is_deleted
                        ? "bg-red-500/20 border-red-500/30 text-red-400"
                        : "bg-zinc-800 border-zinc-700 text-zinc-400 group-hover:text-zinc-100 group-hover:border-zinc-600"
                    }`}
                  >
                    <IconComp
                      className={`w-4 h-4 ${ev.is_deleted ? "text-red-500" : EVENT_COLOR[ev.type]}`}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-xs font-bold text-zinc-200 truncate">
                        {ev.title}
                      </p>
                      {ev.is_deleted && (
                        <span className="text-[8px] font-black text-white uppercase bg-red-500 px-1.5 py-0.5 rounded shadow-[0_0_8px_rgba(239,68,68,0.4)]">
                          SİLİNDİ
                        </span>
                      )}
                      {ev.risk_level && ev.risk_level !== "none" && (
                        <div
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${RISK_DOT[ev.risk_level]}`}
                        />
                      )}
                    </div>
                    <p className="text-[10px] text-zinc-500 font-medium truncate leading-relaxed">
                      {ev.subtitle}
                    </p>
                  </div>
                  <span className="text-[9px] text-zinc-600 font-bold uppercase whitespace-nowrap shrink-0 pt-0.5">
                    {timeAgo(ev.ts)}
                  </span>
                </div>
              );
            })}
          </div>
          <button className="mt-4 w-full py-2.5 rounded-xl border border-zinc-800 text-[10px] font-black text-zinc-500 uppercase tracking-widest hover:bg-zinc-800 transition-colors">
            Tüm Aktiviteyi Gör
          </button>
        </div>

        {/* Locations Card (Modern Map Integration) */}
        <div className="bg-zinc-900/40 rounded-2xl border border-zinc-800/60 p-6 lg:col-span-2 backdrop-blur-sm">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-[15px] font-black text-zinc-200 flex items-center gap-2 uppercase tracking-tight">
              <MapPin className="w-4 h-4 text-[#00a2ff]" />
              Coğrafi Konum Takibi
            </h2>
            <a
              href={
                locationHistory.length > 0
                  ? `https://www.openstreetmap.org/?mlat=${locationHistory[0].latitude}&mlon=${locationHistory[0].longitude}#map=15/${locationHistory[0].latitude}/${locationHistory[0].longitude}`
                  : "https://www.openstreetmap.org"
              }
              target="_blank"
              rel="noreferrer"
              className="text-[#00a2ff] text-[10px] font-black uppercase tracking-widest hover:underline flex items-center gap-1"
            >
              Haritayı Aç <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <div className="flex flex-col md:flex-row gap-8">
            <div className="flex-1 space-y-6">
              {locationHistory.length === 0 ? (
                <p className="text-xs text-zinc-600">Konum verisi yok.</p>
              ) : (
                locationHistory.map((loc, i) => (
                  <div
                    key={i}
                    className="relative pl-6 border-l-2 border-zinc-800"
                  >
                    <div
                      className={`absolute -left-[7px] top-0 w-3 h-3 rounded-full border-2 border-zinc-900 ${i === 0 ? "bg-[#00a2ff] shadow-[0_0_10px_rgba(0,162,255,0.5)]" : "bg-zinc-700"}`}
                    />
                    <div className="flex justify-between items-start">
                      <div>
                        <p
                          className={`text-xs font-black uppercase tracking-tight ${i === 0 ? "text-zinc-100" : "text-zinc-400"}`}
                        >
                          {i === 0
                            ? "Mevcut Konum"
                            : i === 1
                              ? "Önceki Durak"
                              : "Daha Önce"}
                        </p>
                        <a
                          href={`https://www.openstreetmap.org/?mlat=${loc.latitude}&mlon=${loc.longitude}#map=16/${loc.latitude}/${loc.longitude}`}
                          target="_blank"
                          rel="noreferrer"
                          className={`text-xs mt-1 font-mono hover:underline ${i === 0 ? "text-zinc-400" : "text-zinc-500"}`}
                        >
                          {loc.latitude?.toFixed(4)}°N,{" "}
                          {loc.longitude?.toFixed(4)}°E
                        </a>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded border ${i === 0 ? "text-[#00a2ff] bg-blue-500/10 border-blue-500/20" : "text-zinc-600 border-transparent"}`}
                      >
                        {timeAgo(loc.timestamp)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex-1 bg-zinc-950 rounded-2xl overflow-hidden relative min-h-[220px] border border-zinc-800 shadow-inner group">
              <div className="absolute inset-0 bg-[#0c0e12] opacity-40"></div>
              {/* Fake Map Grid */}
              <div
                className="absolute inset-0 opacity-10 pointer-events-none"
                style={{
                  backgroundImage:
                    "radial-gradient(circle, #00a2ff 1px, transparent 1px)",
                  backgroundSize: "24px 24px",
                }}
              ></div>

              <div className="absolute top-4 left-4 bg-zinc-900/90 border border-zinc-800 rounded-lg shadow-xl flex flex-col w-8 overflow-hidden z-10 backdrop-blur-md">
                <button className="h-8 border-b border-zinc-800 flex items-center justify-center font-bold text-zinc-300 hover:text-white hover:bg-zinc-800">
                  +
                </button>
                <button className="h-8 flex items-center justify-center font-bold text-zinc-300 hover:text-white hover:bg-zinc-800">
                  -
                </button>
              </div>

              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                <div className="relative">
                  <div className="absolute inset-0 bg-[#00a2ff]/40 rounded-full scale-[2.5] animate-ping" />
                  <div className="relative w-12 h-12 bg-[#00a2ff] rounded-2xl flex items-center justify-center shadow-[0_0_20px_rgba(0,162,255,0.6)] rotate-12 group-hover:rotate-0 transition-transform duration-500 border-2 border-white/20">
                    <MapPin className="w-6 h-6 text-white" />
                  </div>
                </div>
              </div>

              <div className="absolute bottom-3 right-3 bg-zinc-900/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-zinc-800">
                <p className="text-[9px] font-black text-zinc-300 uppercase tracking-widest">
                  HD Uydu Görünümü
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Device Information (Apple-style Info Card) */}
        <div className="bg-zinc-900/40 rounded-2xl border border-zinc-800/60 p-6 backdrop-blur-sm overflow-hidden relative">
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl" />
          <div className="mb-6 relative h-40 flex items-center justify-center">
            <div className="absolute inset-0 bg-blue-500/10 blur-3xl rounded-full" />
            <img
              src={iphoneMockup}
              alt="iPhone 15 Pro"
              className="h-full object-contain relative z-10 drop-shadow-2xl animate-float"
            />
          </div>
          <div className="space-y-4">
            <div className="flex justify-between items-center group">
              <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                Model
              </span>
              <span className="text-sm text-zinc-100 font-black">
                {diagnostics?.model || "Bağlantı bekleniyor"}
              </span>
            </div>
            <div className="flex justify-between items-center group">
              <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                Versiyon
              </span>
              <span className="text-sm text-zinc-100 font-black">
                {diagnostics?.os_version || "Bağlantı bekleniyor"}
              </span>
            </div>
            <div className="flex justify-between items-center group">
              <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                Seri NO
              </span>
              <span className="text-[11px] text-zinc-400 font-mono bg-zinc-800/50 px-2 py-0.5 rounded border border-zinc-700/50">
                {diagnostics?.serial || "—"}
              </span>
            </div>
            <div className="flex justify-between items-center group">
              <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                Ajan Durumu
              </span>
              {health === null ? (
                <div className="flex items-center gap-1.5 bg-zinc-700/20 px-2.5 py-1 rounded-full border border-zinc-700/30">
                  <div className="w-1.5 h-1.5 bg-zinc-500 rounded-full" />
                  <span className="text-[9px] text-zinc-500 font-black uppercase tracking-widest">
                    Bekleniyor
                  </span>
                </div>
              ) : health.status === "ok" ? (
                <div className="flex items-center gap-1.5 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                  <span className="text-[9px] text-emerald-500 font-black uppercase tracking-widest">
                    Aktif
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 bg-red-500/10 px-2.5 py-1 rounded-full border border-red-500/20">
                  <div className="w-1.5 h-1.5 bg-red-500 rounded-full" />
                  <span className="text-[9px] text-red-400 font-black uppercase tracking-widest">
                    Çevrimdışı
                  </span>
                </div>
              )}
            </div>
            <div className="flex justify-between items-center group">
              <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                WhatsApp
              </span>
              <div
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${health?.whatsapp_agent ? "bg-emerald-500/10 border-emerald-500/20" : "bg-zinc-700/20 border-zinc-700/30"}`}
              >
                <div
                  className={`w-1.5 h-1.5 rounded-full ${health?.whatsapp_agent ? "bg-emerald-500 animate-pulse" : "bg-zinc-500"}`}
                />
                <span
                  className={`text-[9px] font-black uppercase tracking-widest ${health?.whatsapp_agent ? "text-emerald-500" : "text-zinc-500"}`}
                >
                  {health?.whatsapp_agent ? "Bağlı" : "Kapalı"}
                </span>
              </div>
            </div>
          </div>
          <div className="mt-8 flex flex-wrap gap-4 pt-6 border-t border-zinc-800/50">
            <div className="flex flex-col gap-1 px-3 py-2 bg-zinc-800/40 rounded-xl border border-zinc-700/30 flex-1 min-w-[70px]">
              <Battery className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-black text-zinc-100">
                {diagnostics?.battery != null ? `${diagnostics.battery}%` : "—"}
              </span>
            </div>
            <div className="flex flex-col gap-1 px-3 py-2 bg-zinc-800/40 rounded-xl border border-zinc-700/30 flex-1 min-w-[70px]">
              <Wifi className="w-4 h-4 text-[#00a2ff]" />
              <span className="text-xs font-black text-zinc-100 uppercase">
                {diagnostics?.wifi_ssid || "—"}
              </span>
            </div>
            <div className="flex flex-col gap-1 px-3 py-2 bg-zinc-800/40 rounded-xl border border-zinc-700/30 flex-1 min-w-[70px]">
              <ShieldCheck className="w-4 h-4 text-purple-400" />
              <span className="text-xs font-black text-zinc-100 uppercase">
                GÜVENLİ
              </span>
            </div>
          </div>
        </div>

        {/* Subscription / Account Card */}
        <div className="bg-zinc-900/40 rounded-2xl border border-zinc-800/60 p-6 backdrop-blur-sm">
          <h2 className="text-[15px] font-black text-zinc-200 mb-6 flex items-center gap-2 uppercase tracking-tight">
            <CreditCard className="w-4 h-4 text-zinc-400" /> Abonelik Planı
          </h2>
          <div className="p-4 bg-gradient-to-br from-[#00a2ff]/10 to-[#00a2ff]/5 rounded-2xl border border-[#00a2ff]/20 mb-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-black text-[#00a2ff] uppercase tracking-[0.2em] mb-1">
                  Premium Plan
                </p>
                <p className="text-lg font-black text-zinc-100 tracking-tight">
                  Üstün İzleme
                </p>
              </div>
              <div className="w-8 h-8 bg-zinc-900 rounded-lg border border-zinc-800 flex items-center justify-center">
                <Shield className="w-4 h-4 text-[#00a2ff]" />
              </div>
            </div>
            <div className="mt-6 flex items-end justify-between">
              <div>
                <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">
                  Son Geçerlilik
                </p>
                <p className="text-xs font-black text-zinc-300">10 Ağu 2026</p>
              </div>
              <div className="flex -space-x-2">
                <div className="w-6 h-6 rounded-full border border-zinc-900 bg-zinc-800" />
                <div className="w-6 h-6 rounded-full border border-zinc-900 bg-blue-500" />
              </div>
            </div>
          </div>
          <button
            onClick={() => setComingSoon(true)}
            className="w-full bg-[#00a2ff] hover:bg-[#008de6] text-white text-[10px] font-black uppercase tracking-[0.2em] py-4 rounded-xl shadow-lg shadow-blue-500/20 transition-all hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2"
          >
            Planı Yükselt <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Communication Analytics (Unified Call/Message Stats) */}
        <div className="bg-zinc-900/40 rounded-2xl border border-zinc-800/60 p-6 lg:col-span-1 backdrop-blur-sm">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-[15px] font-black text-zinc-200 flex items-center gap-2 uppercase tracking-tight">
              <Phone className="w-4 h-4 text-emerald-400" /> En Sık İletişim
            </h2>
          </div>
          {topContacts.length === 0 ? (
            <p className="text-zinc-600 text-xs text-center py-8">
              Veri bekleniyor…
            </p>
          ) : (
            <div className="space-y-6">
              {(() => {
                const maxCount = Math.max(
                  ...topContacts.map((c) => c.message_count),
                  1,
                );
                const colors = [
                  "bg-emerald-500",
                  "bg-[#00a2ff]",
                  "bg-amber-500",
                ];
                return topContacts.map((contact, idx) => {
                  const name = contact.name || "?";
                  const pct = Math.round(
                    (contact.message_count / maxCount) * 100,
                  );
                  return (
                    <div key={name} className="group">
                      <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[10px] font-black text-zinc-400 group-hover:text-zinc-100 transition-colors">
                            {name[0]?.toUpperCase()}
                          </div>
                          <div>
                            <p className="text-xs font-black text-zinc-200 tracking-tight truncate max-w-[100px]">
                              {name}
                            </p>
                            <p className="text-[10px] font-medium text-zinc-500">
                              {contact.risk_level !== "none"
                                ? `⚠ ${contact.risk_level}`
                                : "Normal"}
                            </p>
                          </div>
                        </div>
                        <span className="text-[10px] font-black text-zinc-400">
                          {contact.message_count} Kere
                        </span>
                      </div>
                      <div className="w-full bg-zinc-800/50 h-1.5 rounded-full overflow-hidden border border-zinc-800/80">
                        <div
                          className={`h-full rounded-full transition-all duration-1000 ${colors[idx] || "bg-zinc-500"} shadow-[0_0_8px_rgba(0,0,0,0.3)]`}
                          style={{ width: `${pct}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </div>

        {/* Security & Remote Control */}
        <div className="bg-zinc-900/40 rounded-2xl border border-zinc-800/60 p-6 lg:col-span-2 backdrop-blur-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none">
            <Shield className="w-64 h-64 rotate-12" />
          </div>
          <h2 className="text-[15px] font-black text-zinc-200 mb-6 flex items-center gap-2 uppercase tracking-tight">
            <Lock className="w-4 h-4 text-[#00a2ff]" /> Güvenlik & Uzaktan
            Kontrol
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <div className="flex justify-between items-center p-3 rounded-xl bg-zinc-800/30 border border-zinc-700/30">
                <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                  Ekran Kilidi
                </span>
                <span className="text-[10px] font-black text-red-400 flex items-center gap-1.5 bg-red-400/10 px-2 py-0.5 rounded border border-red-400/20 uppercase tracking-widest">
                  <Lock className="w-3 h-3" /> AKTİF (PIN)
                </span>
              </div>
              <div className="flex justify-between items-center p-3 rounded-xl bg-zinc-800/30 border border-zinc-700/30">
                <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                  Son Şifre Değişimi
                </span>
                <span className="text-[11px] text-zinc-200 font-black">
                  12 gün önce
                </span>
              </div>
              <div className="p-4 bg-emerald-500/5 rounded-2xl border border-emerald-500/20">
                <label className="text-[9px] font-black text-emerald-500 uppercase tracking-widest mb-1.5 block">
                  Master Recovery Key
                </label>
                <div className="font-mono text-sm text-emerald-400 font-black tracking-widest bg-zinc-950/50 p-2 rounded-lg border border-emerald-500/10">
                  {"•".repeat(18)}
                </div>
                <p className="text-[10px] text-zinc-600 mt-2 font-medium">
                  Bu anahtarı güvenli bir fiziksel ortamda saklayın.
                </p>
              </div>
            </div>
            <div className="flex flex-col justify-center gap-3">
              <p className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em] mb-1">
                Uzaktan Komutlar
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setComingSoon(true)}
                  className="group flex flex-col items-center justify-center gap-3 p-4 bg-zinc-100 text-zinc-950 rounded-2xl hover:bg-white transition-all shadow-xl shadow-white/5 active:scale-95"
                >
                  <Lock className="w-5 h-5 group-hover:scale-110 transition-transform" />
                  <span className="text-[9px] font-black uppercase tracking-tighter">
                    Cihazı Kilitle
                  </span>
                </button>
                <button
                  onClick={() => setComingSoon(true)}
                  className="group flex flex-col items-center justify-center gap-3 p-4 bg-zinc-900 border border-zinc-800 text-zinc-400 rounded-2xl hover:text-white hover:border-zinc-700 transition-all active:scale-95"
                >
                  <Key className="w-5 h-5 group-hover:scale-110 transition-transform" />
                  <span className="text-[9px] font-black uppercase tracking-tighter">
                    PIN Sıfırla
                  </span>
                </button>
                <button
                  onClick={async () => {
                    try {
                      await apiFetch(
                        `${API_BASE}/api/screenshots/take/${PROFILE_ID}`,
                        { method: "POST" },
                      );
                      alert("Ekran görüntüsü komutu gönderildi!");
                    } catch (e) {
                      alert("Bağlantı hatası!");
                    }
                  }}
                  className="group flex flex-col items-center justify-center gap-3 p-4 bg-zinc-900 border border-zinc-800 text-zinc-400 rounded-2xl hover:text-white hover:border-zinc-700 transition-all active:scale-95"
                >
                  <Smartphone className="w-5 h-5 group-hover:scale-110 transition-transform" />
                  <span className="text-[9px] font-black uppercase tracking-tighter">
                    Ekran Alıntısı
                  </span>
                </button>
                <button
                  onClick={() => setComingSoon(true)}
                  className="group flex flex-col items-center justify-center gap-3 p-4 bg-red-500/10 border border-red-500/20 text-red-500 rounded-2xl hover:bg-red-500 hover:text-white transition-all active:scale-95"
                >
                  <ShieldAlert className="w-5 h-5 group-hover:scale-110 transition-transform" />
                  <span className="text-[9px] font-black uppercase tracking-tighter">
                    Sıfırla (Wipe)
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
