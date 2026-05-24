import { useState, useEffect, useRef, useCallback } from "react";
import { apiFetch } from "./api";
import { io } from "socket.io-client";
import SimplePeer from "simple-peer";
import {
  Download,
  MoreVertical,
  Plus,
  Edit2,
  X,
  MapPin,
  Maximize2,
  User,
  Ban,
  MonitorPlay,
  Video,
  Mic,
  Radio,
  Camera,
  AlertTriangle,
  MessageSquare,
  Phone,
  Shield,
  Activity,
  ShieldAlert,
  Lock,
  Key,
  RefreshCw,
} from "lucide-react";

const TopBar = ({ title }) => (
  <div className="h-14 border-b border-zinc-800 flex items-center justify-between px-6 bg-zinc-900/50">
    <h2 className="text-lg text-zinc-200">{title}</h2>
    <div className="flex items-center gap-4">
      <MoreVertical className="w-5 h-5 text-zinc-500 cursor-pointer" />
    </div>
  </div>
);

const TableView = ({ title, columns, data, extraHeader }) => (
  <div className="flex flex-col h-full bg-zinc-950 text-zinc-300">
    <TopBar title={title} />
    <div className="p-6 flex-1 overflow-y-auto">
      {extraHeader}
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-800/50 text-zinc-400 font-semibold border-b border-zinc-800">
            <tr>
              {columns.map((col, idx) => (
                <th key={idx} className="px-6 py-4">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/50">
            {data.map((row, rowIdx) => (
              <tr
                key={rowIdx}
                className="hover:bg-zinc-800/30 transition-colors"
              >
                {Object.values(row).map((cell, cellIdx) => (
                  <td key={cellIdx} className="px-6 py-4">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </div>
);

const BACKEND_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
const COMMS_API = BACKEND_URL;
const COMMS_PROFILE = "default";

function fmtSec(sec) {
  if (!sec) return "00:00";
  const m = Math.floor(sec / 60),
    s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export const CallsView = () => {
  const [calls, setCalls] = useState([]);
  const [suspicious, setSuspicious] = useState(null);
  const [tab, setTab] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      try {
        const [cRes, sRes] = await Promise.all([
          apiFetch(`${COMMS_API}/api/calls/${COMMS_PROFILE}?limit=200`),
          apiFetch(`${COMMS_API}/api/calls/${COMMS_PROFILE}/suspicious`),
        ]);
        if (alive && cRes.ok) {
          const d = await cRes.json();
          setCalls(Array.isArray(d) ? d : []);
        }
        if (alive && sRes.ok) setSuspicious(await sRes.json());
      } catch {
        /* offline → empty */
      }
      if (alive) setLoading(false);
    }
    load();
    return () => {
      alive = false;
    };
  }, []);

  const nightCount = suspicious?.night_calls?.length ?? 0;
  const rows =
    tab === "night"
      ? (suspicious?.night_calls ?? []).map((n) => ({
          direction: n.direction,
          phone_number: n.number,
          duration: n.duration,
          timestamp: n.timestamp,
          _night: true,
        }))
      : calls;

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-300">
      <TopBar title="Arama Geçmişi & Güvenlik" />
      <div className="p-6 flex-1 overflow-y-auto space-y-5">
        {/* Özet */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Toplam Arama", value: calls.length },
            { label: "Gece Araması", value: nightCount, warn: nightCount > 0 },
            {
              label: "Bilinmeyen Numara",
              value: suspicious?.frequent_unknown?.length ?? 0,
            },
          ].map((s) => (
            <div
              key={s.label}
              className={`bg-zinc-900 border rounded-lg p-4 text-center ${s.warn ? "border-amber-500/40" : "border-zinc-800"}`}
            >
              <div
                className={`text-2xl font-bold ${s.warn ? "text-amber-400" : "text-zinc-100"}`}
              >
                {s.value}
              </div>
              <div className="text-[10px] text-zinc-500 mt-1 uppercase tracking-wider">
                {s.label}
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-800">
          {[
            ["all", "Tüm Aramalar"],
            ["night", "🌙 Gece Aramaları"],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-5 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors
                ${tab === key ? "text-[#00a2ff] border-b-2 border-[#00a2ff]" : "text-zinc-500 hover:text-zinc-300"}`}
            >
              {label}
              {key === "night" && nightCount > 0 && (
                <span className="ml-2 px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded text-[9px]">
                  {nightCount}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-800/50 text-zinc-400 font-semibold border-b border-zinc-800">
              <tr>
                <th className="px-5 py-3">Yön</th>
                <th className="px-5 py-3">Numara</th>
                <th className="px-5 py-3">Süre</th>
                <th className="px-5 py-3">Tarih</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {loading ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-5 py-8 text-center text-zinc-600"
                  >
                    Yükleniyor…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-5 py-8 text-center text-zinc-600"
                  >
                    Kayıt yok.
                  </td>
                </tr>
              ) : (
                rows.map((c, i) => {
                  const dir =
                    getattr(c, "direction") ||
                    getattr(c, "call_type") ||
                    (c.is_outgoing ? "outgoing" : "incoming");
                  const isNight = c._night;
                  const dirColor =
                    dir === "outgoing"
                      ? "text-blue-400"
                      : dir === "missed"
                        ? "text-red-400"
                        : "text-emerald-400";
                  return (
                    <tr
                      key={i}
                      className={`hover:bg-zinc-800/30 transition-colors ${isNight ? "bg-amber-500/5" : ""}`}
                    >
                      <td className="px-5 py-3">
                        <span
                          className={`text-xs font-bold uppercase ${dirColor}`}
                        >
                          {dir}
                        </span>
                        {isNight && (
                          <span className="ml-2 text-[10px] text-amber-400">
                            🌙
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-zinc-300">
                        <div className="font-medium">
                          {c.contact_name && c.contact_name !== c.phone_number
                            ? c.contact_name
                            : c.phone_number || "?"}
                        </div>
                        {c.contact_name &&
                          c.contact_name !== c.phone_number && (
                            <div className="text-[10px] text-zinc-500 font-mono">
                              {c.phone_number}
                            </div>
                          )}
                      </td>
                      <td className="px-5 py-3 text-zinc-400">
                        {fmtSec(c.duration)}
                      </td>
                      <td className="px-5 py-3 text-zinc-500 text-[11px]">
                        {c.timestamp
                          ? new Date(c.timestamp).toLocaleString("tr-TR")
                          : "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// helper — güvenli alan erişimi (RN model vs dict)
function getattr(obj, key) {
  return obj?.[key] ?? null;
}

export const SmsView = () => {
  const [msgs, setMsgs] = useState([]);
  const [summary, setSummary] = useState(null);
  const [tab, setTab] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      try {
        const [mRes, aRes] = await Promise.all([
          apiFetch(`${COMMS_API}/api/sms/${COMMS_PROFILE}?limit=200`),
          apiFetch(`${COMMS_API}/api/sms/${COMMS_PROFILE}/analyze`),
        ]);
        if (alive && mRes.ok) {
          const d = await mRes.json();
          setMsgs(Array.isArray(d) ? d : []);
        }
        if (alive && aRes.ok) setSummary(await aRes.json());
      } catch {
        /* offline */
      }
      if (alive) setLoading(false);
    }
    load();
    return () => {
      alive = false;
    };
  }, []);

  const flaggedCount = summary?.flagged?.length ?? 0;
  const rows =
    tab === "flagged"
      ? msgs.filter((m) => m.risk_level && m.risk_level !== "none")
      : msgs;

  const RISK_STYLE = {
    high: "bg-red-500/10 text-red-400 border border-red-500/30",
    medium: "bg-amber-500/10 text-amber-400 border border-amber-500/30",
    low: "bg-yellow-500/10 text-yellow-400 border border-yellow-500/30",
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-300">
      <TopBar title="SMS Güvenlik Analizi" />
      <div className="p-6 flex-1 overflow-y-auto space-y-5">
        {/* Özet */}
        {summary && (
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Toplam SMS", value: summary.total },
              {
                label: "Yüksek Risk",
                value: summary.high,
                warn: summary.high > 0,
              },
              {
                label: "Orta Risk",
                value: summary.medium,
                warn: summary.medium > 0,
              },
              { label: "Düşük Risk", value: summary.low },
            ].map((s) => (
              <div
                key={s.label}
                className={`bg-zinc-900 border rounded-lg p-3 text-center ${s.warn ? "border-red-500/40" : "border-zinc-800"}`}
              >
                <div
                  className={`text-xl font-bold ${s.warn ? "text-red-400" : "text-zinc-100"}`}
                >
                  {s.value}
                </div>
                <div className="text-[10px] text-zinc-500 mt-0.5 uppercase tracking-wider">
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-zinc-800">
          {[
            ["all", "Tüm SMS"],
            ["flagged", "⚠️ Riskli"],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-5 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors
                ${tab === key ? "text-[#00a2ff] border-b-2 border-[#00a2ff]" : "text-zinc-500 hover:text-zinc-300"}`}
            >
              {label}
              {key === "flagged" && flaggedCount > 0 && (
                <span className="ml-2 px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded text-[9px]">
                  {flaggedCount}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-800/50 text-zinc-400 font-semibold border-b border-zinc-800">
              <tr>
                <th className="px-5 py-3">Gönderen</th>
                <th className="px-5 py-3">İçerik</th>
                <th className="px-5 py-3 w-28">Risk</th>
                <th className="px-5 py-3 w-36">Tarih</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {loading ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-5 py-8 text-center text-zinc-600"
                  >
                    Yükleniyor…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-5 py-8 text-center text-zinc-600"
                  >
                    {tab === "flagged" ? "Riskli SMS yok." : "SMS kaydı yok."}
                  </td>
                </tr>
              ) : (
                rows.map((m, i) => (
                  <tr
                    key={i}
                    className={`hover:bg-zinc-800/30 transition-colors ${m.risk_level === "high" ? "bg-red-500/5" : ""}`}
                  >
                    <td className="px-5 py-3 text-zinc-300">
                      <div className="font-medium">
                        {m.contact_name && m.contact_name !== m.sender
                          ? m.contact_name
                          : m.sender || "?"}
                      </div>
                      {m.contact_name && m.contact_name !== m.sender && (
                        <div className="text-[10px] text-zinc-500 font-mono">
                          {m.sender}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3 text-zinc-400 max-w-xs truncate">
                      {m.is_redacted && (
                        <span className="text-[10px] text-amber-400 mr-1.5">
                          [Redakte]
                        </span>
                      )}
                      {m.text || "—"}
                    </td>
                    <td className="px-5 py-3">
                      {m.risk_level && m.risk_level !== "none" ? (
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded font-bold ${RISK_STYLE[m.risk_level] || ""}`}
                        >
                          {m.risk_level.toUpperCase()}
                        </span>
                      ) : (
                        <span className="text-zinc-600 text-[10px]">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-zinc-500 text-[11px]">
                      {m.timestamp
                        ? new Date(m.timestamp).toLocaleString("tr-TR")
                        : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export const EventsView = () => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      try {
        const res = await apiFetch(
          `${COMMS_API}/api/events/${COMMS_PROFILE}?limit=100`,
        );
        if (alive && res.ok) {
          const d = await res.json();
          setEvents(Array.isArray(d) ? d : []);
        }
      } catch {
        /* offline */
      }
      if (alive) setLoading(false);
    }
    load();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-300">
      <TopBar title="Etkinlikler" />
      <div className="p-6 flex-1 overflow-y-auto">
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-800/50 text-zinc-400 font-semibold border-b border-zinc-800">
              <tr>
                <th className="px-6 py-4">Başlık</th>
                <th className="px-6 py-4">Konum</th>
                <th className="px-6 py-4">Başlangıç</th>
                <th className="px-6 py-4">Bitiş</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {loading ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-6 py-8 text-center text-zinc-600"
                  >
                    Yükleniyor…
                  </td>
                </tr>
              ) : events.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-6 py-8 text-center text-zinc-600"
                  >
                    Takvim etkinliği bulunamadı.
                  </td>
                </tr>
              ) : (
                events.map((ev, i) => (
                  <tr
                    key={i}
                    className="hover:bg-zinc-800/30 transition-colors"
                  >
                    <td className="px-6 py-4 text-zinc-200 font-medium">
                      {ev.title || "—"}
                    </td>
                    <td className="px-6 py-4 text-zinc-400">
                      {ev.location || "—"}
                    </td>
                    <td className="px-6 py-4 text-zinc-500 text-xs">
                      {ev.start
                        ? new Date(ev.start).toLocaleString("tr-TR")
                        : "—"}
                    </td>
                    <td className="px-6 py-4 text-zinc-500 text-xs">
                      {ev.end ? new Date(ev.end).toLocaleString("tr-TR") : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const WIFI_API = BACKEND_URL;
const WIFI_PROFILE = "default";

function signalBar(dbm) {
  if (dbm == null) return { bars: 0, color: "text-zinc-600", label: "?" };
  if (dbm >= -60) return { bars: 4, color: "text-emerald-400", label: "Güçlü" };
  if (dbm >= -70) return { bars: 3, color: "text-emerald-400", label: "İyi" };
  if (dbm >= -80) return { bars: 2, color: "text-amber-400", label: "Zayıf" };
  return { bars: 1, color: "text-red-400", label: "Çok Zayıf" };
}

function fmtDuration(sec) {
  if (!sec) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h) return `${h}s ${m}d`;
  if (m) return `${m}d ${s}s`;
  return `${s}s`;
}

export const WifiView = () => {
  const [history, setHistory] = useState([]);
  const [flagged, setFlagged] = useState([]);
  const [tab, setTab] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      try {
        const [hRes, fRes] = await Promise.all([
          apiFetch(`${WIFI_API}/api/wifi/${WIFI_PROFILE}?limit=100`),
          apiFetch(`${WIFI_API}/api/wifi/${WIFI_PROFILE}/flagged`),
        ]);
        if (alive && hRes.ok) {
          const d = await hRes.json();
          setHistory(Array.isArray(d) ? d : []);
        }
        if (alive && fRes.ok) {
          const d = await fRes.json();
          setFlagged(Array.isArray(d) ? d : []);
        }
      } catch {
        /* offline */
      }
      if (alive) setLoading(false);
    }
    load();
    const t = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const rows = tab === "flagged" ? flagged : history;

  const uniqueNets = new Set(history.map((r) => r.ssid)).size;
  const openCount = history.filter((r) => r.is_open).length;
  const weakCount = history.filter(
    (r) => r.signal_dbm != null && r.signal_dbm < -80,
  ).length;

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-300">
      <TopBar title="Wi-Fi Ağ Güvenliği" />

      <div className="p-6 flex-1 overflow-y-auto space-y-6">
        {/* Özet */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Benzersiz Ağ", value: uniqueNets },
            { label: "Açık (Şifresiz)", value: openCount, warn: openCount > 0 },
            { label: "Zayıf Sinyal", value: weakCount, warn: weakCount > 0 },
          ].map((s) => (
            <div
              key={s.label}
              className={`bg-zinc-900 border rounded-lg p-4 text-center ${s.warn ? "border-red-500/40" : "border-zinc-800"}`}
            >
              <div
                className={`text-2xl font-bold ${s.warn ? "text-red-400" : "text-zinc-100"}`}
              >
                {s.value}
              </div>
              <div className="text-[10px] text-zinc-500 mt-1 uppercase tracking-wider">
                {s.label}
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-800">
          {[
            ["all", "Tüm Bağlantılar"],
            ["flagged", "⚠️ Güvensiz Ağlar"],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-5 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors
                ${tab === key ? "text-[#00a2ff] border-b-2 border-[#00a2ff]" : "text-zinc-500 hover:text-zinc-300"}`}
            >
              {label}
              {key === "flagged" && flagged.length > 0 && (
                <span className="ml-2 px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded text-[9px]">
                  {flagged.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tablo */}
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-800/50 text-zinc-400 font-semibold border-b border-zinc-800">
              <tr>
                <th className="px-5 py-3">SSID</th>
                <th className="px-5 py-3">BSSID</th>
                <th className="px-5 py-3">Sinyal</th>
                <th className="px-5 py-3">Güvenlik</th>
                <th className="px-5 py-3">Konum</th>
                <th className="px-5 py-3">Süre</th>
                <th className="px-5 py-3">Bağlandı</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {loading ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-5 py-8 text-center text-zinc-600"
                  >
                    Yükleniyor…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-5 py-8 text-center text-zinc-600"
                  >
                    {tab === "flagged"
                      ? "Güvensiz ağ tespit edilmedi."
                      : "Henüz bağlantı kaydı yok."}
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => {
                  const sig = signalBar(r.signal_dbm);
                  const open = Boolean(r.is_open);
                  const ts = r.connected_at
                    ? new Date(r.connected_at).toLocaleString("tr-TR")
                    : "—";
                  const hasLoc = r.latitude != null && r.longitude != null;
                  return (
                    <tr
                      key={i}
                      className={`hover:bg-zinc-800/30 transition-colors ${open ? "bg-red-500/5" : ""}`}
                    >
                      <td className="px-5 py-3">
                        <div className="font-medium text-zinc-200">
                          {r.ssid}
                        </div>
                        {open && (
                          <div className="text-[10px] text-red-400 mt-0.5">
                            Açık Ağ
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3 font-mono text-[11px] text-zinc-500">
                        {r.bssid || "—"}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`text-xs font-bold ${sig.color}`}>
                          {r.signal_dbm != null ? `${r.signal_dbm} dBm` : "—"}
                        </span>
                        <div className={`text-[10px] ${sig.color}`}>
                          {sig.label}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded font-bold border
                        ${
                          open
                            ? "bg-red-500/10 text-red-400 border-red-500/30"
                            : "bg-zinc-800 text-zinc-400 border-zinc-700"
                        }`}
                        >
                          {open
                            ? "AÇIK"
                            : (r.security_type || "unknown").toUpperCase()}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-[11px]">
                        {hasLoc ? (
                          <a
                            href={`https://maps.google.com/?q=${r.latitude},${r.longitude}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[#00a2ff] hover:underline font-mono"
                          >
                            {r.latitude.toFixed(5)}, {r.longitude.toFixed(5)}
                          </a>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-zinc-400 text-[11px]">
                        {fmtDuration(r.duration_sec)}
                      </td>
                      <td className="px-5 py-3 text-zinc-500 text-[11px]">
                        {ts}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export const PhotoView = () => {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("all"); // "all", "icloud", "archived"

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      try {
        const [iRes, aRes] = await Promise.all([
          apiFetch(`${BACKEND_URL}/api/photos/${COMMS_PROFILE}?limit=60`),
          apiFetch(
            `${BACKEND_URL}/api/photos/archived/${COMMS_PROFILE}?limit=60`,
          ),
        ]);

        let iData = iRes.ok ? await iRes.json() : [];
        let aData = aRes.ok ? await aRes.json() : [];

        // Kaynak etiketleri ekle
        iData = iData.map((p) => ({ ...p, source: "iCloud" }));
        aData = aData.map((p) => ({ ...p, source: "Arşiv" }));

        if (alive) {
          const combined = [...aData, ...iData].sort(
            (a, b) => new Date(b.created) - new Date(a.created),
          );
          setPhotos(combined);
        }
      } catch (err) {
        console.error("Photo fetch error:", err);
      }
      if (alive) setLoading(false);
    }
    load();
    return () => {
      alive = false;
    };
  }, []);

  const filtered =
    tab === "all"
      ? photos
      : photos.filter((p) => p.source.toLowerCase() === tab);

  function fmtSize(b) {
    if (!b) return "—";
    if (b > 1048576) return (b / 1048576).toFixed(1) + " MB";
    return (b / 1024).toFixed(0) + " KB";
  }

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-300">
      <TopBar title={`Galeri & Arşiv (${filtered.length})`} />
      <div className="p-6 flex-1 overflow-y-auto">
        {/* Tab Seçimi */}
        <div className="flex gap-4 mb-6 bg-zinc-900 p-1 rounded-lg w-max border border-zinc-800">
          {[
            { id: "all", label: "Tümü" },
            { id: "icloud", label: "iCloud" },
            { id: "arşiv", label: "🛡️ Arşiv (Silinenler)" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${tab === t.id ? "bg-[#00a2ff] text-white shadow-lg" : "text-zinc-500 hover:text-zinc-300"}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center text-zinc-600 py-16 animate-pulse">
            Veriler taranıyor...
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-zinc-600 py-16">
            Seçilen kategoride medya bulunamadı.
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filtered.map((p, i) => (
              <div
                key={i}
                className={`bg-zinc-900 border rounded-lg overflow-hidden group relative ${p.source === "Arşiv" ? "border-red-500/30" : "border-zinc-800"}`}
              >
                {/* Kaynak Etiketi */}
                <div
                  className={`absolute top-2 left-2 z-10 px-2 py-0.5 rounded-full text-[9px] font-bold shadow-lg ${p.source === "Arşiv" ? "bg-red-600 text-white" : "bg-[#00a2ff] text-white"}`}
                >
                  {p.source.toUpperCase()}
                </div>

                <div className="aspect-square bg-zinc-800 flex items-center justify-center relative">
                  <img
                    src={
                      p.download_url.startsWith("http")
                        ? p.download_url
                        : `${BACKEND_URL}${p.download_url}`
                    }
                    alt={p.filename}
                    className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-300"
                    onError={(e) => {
                      e.currentTarget.src =
                        "https://via.placeholder.com/150?text=Medya+Hatas%C4%B1";
                    }}
                  />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                    <a
                      href={
                        p.download_url.startsWith("http")
                          ? p.download_url
                          : `${BACKEND_URL}${p.download_url}`
                      }
                      target="_blank"
                      className="bg-white/10 hover:bg-white/20 p-2 rounded-full backdrop-blur-md"
                    >
                      <Maximize2 className="w-4 h-4 text-white" />
                    </a>
                    <a
                      href={
                        p.download_url.startsWith("http")
                          ? p.download_url
                          : `${BACKEND_URL}${p.download_url}`
                      }
                      download={p.filename}
                      className="bg-[#00a2ff] text-white p-2 rounded-full shadow-lg"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                  </div>
                </div>
                <div className="p-2 text-[10px] text-zinc-500 flex justify-between border-t border-zinc-800">
                  <span className="truncate max-w-[60%] font-mono">
                    {p.filename}
                  </span>
                  <span>{fmtSize(p.size)}</span>
                </div>
                <div className="px-2 pb-2 text-[9px] text-zinc-600">
                  {p.created
                    ? new Date(p.created).toLocaleString("tr-TR")
                    : "—"}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export const KeywordView = () => {
  const [tab, setTab] = useState("rules");
  const [keywords, setKeywords] = useState([]);
  const [hits, setHits] = useState([]);
  const [input, setInput] = useState("");
  const [scope, setScope] = useState("all");
  const [scanning, setScanning] = useState(false);

  const reload = useCallback(() => {
    apiFetch(`${BACKEND_URL}/api/keywords/${COMMS_PROFILE}`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setKeywords)
      .catch(() => {});
    apiFetch(`${BACKEND_URL}/api/keywords/${COMMS_PROFILE}/hits?limit=200`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setHits)
      .catch(() => {});
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  async function addKeyword() {
    const kw = input.trim();
    if (!kw) return;
    await apiFetch(`${BACKEND_URL}/api/keywords/${COMMS_PROFILE}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword: kw, scope, action: "notify" }),
    });
    setInput("");
    reload();
  }

  async function removeKeyword(id) {
    await apiFetch(`${BACKEND_URL}/api/keywords/${COMMS_PROFILE}/${id}`, {
      method: "DELETE",
    });
    reload();
  }

  async function runScan() {
    setScanning(true);
    await apiFetch(`${BACKEND_URL}/api/keywords/${COMMS_PROFILE}/scan`, {
      method: "POST",
    });
    setScanning(false);
    reload();
  }

  const SCOPE_LABEL = { all: "Tümü", whatsapp: "WhatsApp", sms: "SMS" };

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-300">
      <TopBar title="Keyword Takip" />
      <div className="p-6 flex-1 overflow-y-auto space-y-5">
        {/* Tabs */}
        <div className="flex border-b border-zinc-800">
          {[
            ["rules", "Kurallar"],
            ["hits", `Tespitler (${hits.length})`],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-5 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors
                ${tab === key ? "text-[#00a2ff] border-b-2 border-[#00a2ff]" : "text-zinc-500 hover:text-zinc-300"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "rules" && (
          <>
            {/* Add form */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex gap-3 items-end">
              <div className="flex-1">
                <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">
                  Kelime / İfade
                </label>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addKeyword()}
                  placeholder="Eklenecek kelimeyi yaz…"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-[#00a2ff] text-zinc-200"
                />
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">
                  Kaynak
                </label>
                <select
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                  className="bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-[#00a2ff] text-zinc-200"
                >
                  <option value="all">Tümü</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="sms">SMS</option>
                </select>
              </div>
              <button
                onClick={addKeyword}
                className="bg-[#00a2ff] hover:bg-[#008de6] text-white px-5 py-2 rounded font-bold text-sm transition-colors"
              >
                Ekle
              </button>
              <button
                onClick={runScan}
                disabled={scanning}
                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-5 py-2 rounded font-bold text-sm transition-colors disabled:opacity-50"
              >
                {scanning ? "Taranıyor…" : "Tara"}
              </button>
            </div>

            {/* Rules table */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="bg-zinc-800/50 text-zinc-400 text-xs uppercase tracking-wider border-b border-zinc-800">
                  <tr>
                    <th className="px-5 py-3">Kelime</th>
                    <th className="px-5 py-3">Kaynak</th>
                    <th className="px-5 py-3">Eklenme</th>
                    <th className="px-5 py-3 w-16"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {keywords.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-5 py-10 text-center text-zinc-600"
                      >
                        Henüz kural eklenmedi.
                      </td>
                    </tr>
                  ) : (
                    keywords.map((kw) => (
                      <tr key={kw.id} className="hover:bg-zinc-800/30">
                        <td className="px-5 py-3 font-mono text-zinc-200">
                          {kw.keyword}
                        </td>
                        <td className="px-5 py-3 text-zinc-500 text-xs">
                          {SCOPE_LABEL[kw.scope] || kw.scope}
                        </td>
                        <td className="px-5 py-3 text-zinc-600 text-xs">
                          {new Date(kw.created_at).toLocaleDateString("tr-TR")}
                        </td>
                        <td className="px-5 py-3">
                          <button
                            onClick={() => removeKeyword(kw.id)}
                            className="text-red-500 hover:text-red-400 text-xs font-bold transition-colors"
                          >
                            Sil
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "hits" && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-zinc-800/50 text-zinc-400 text-xs uppercase tracking-wider border-b border-zinc-800">
                <tr>
                  <th className="px-5 py-3">Kelime</th>
                  <th className="px-5 py-3">Kaynak</th>
                  <th className="px-5 py-3">Gönderen</th>
                  <th className="px-5 py-3">İçerik</th>
                  <th className="px-5 py-3">Tarih</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {hits.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-5 py-10 text-center text-zinc-600"
                    >
                      Tespit yok. "Tara" butonuna bas.
                    </td>
                  </tr>
                ) : (
                  hits.map((h) => (
                    <tr key={h.id} className="hover:bg-zinc-800/30">
                      <td className="px-5 py-3 font-mono text-amber-400 text-xs">
                        {h.keyword}
                      </td>
                      <td className="px-5 py-3 text-zinc-500 text-xs uppercase">
                        {h.source}
                      </td>
                      <td className="px-5 py-3 text-zinc-400 font-mono text-xs">
                        {h.sender || "—"}
                      </td>
                      <td className="px-5 py-3 text-zinc-400 text-xs truncate max-w-xs">
                        {h.matched_text}
                      </td>
                      <td className="px-5 py-3 text-zinc-600 text-[10px]">
                        {new Date(h.hit_at).toLocaleString("tr-TR")}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export const GpsLocationsView = () => {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      try {
        const res = await apiFetch(
          `${COMMS_API}/api/location_history/${COMMS_PROFILE}?limit=100`,
        );
        if (alive && res.ok) {
          const d = await res.json();
          setLocations(Array.isArray(d) ? d : []);
        }
      } catch {
        /* offline */
      }
      if (alive) setLoading(false);
    }
    load();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-300">
      <TopBar title="GPS Konum Geçmişi" />
      <div className="p-6 flex-1 overflow-y-auto">
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-800/50 text-zinc-400 font-semibold border-b border-zinc-800">
              <tr>
                <th className="px-5 py-3">Enlem</th>
                <th className="px-5 py-3">Boylam</th>
                <th className="px-5 py-3">Doğruluk</th>
                <th className="px-5 py-3">Harita</th>
                <th className="px-5 py-3">Tarih</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {loading ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-8 text-center text-zinc-600"
                  >
                    Yükleniyor…
                  </td>
                </tr>
              ) : locations.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-8 text-center text-zinc-600"
                  >
                    Konum kaydı bulunamadı.
                  </td>
                </tr>
              ) : (
                locations.map((loc, i) => (
                  <tr
                    key={i}
                    className="hover:bg-zinc-800/30 transition-colors"
                  >
                    <td className="px-5 py-3 font-mono text-xs">
                      {loc.latitude?.toFixed(6)}
                    </td>
                    <td className="px-5 py-3 font-mono text-xs">
                      {loc.longitude?.toFixed(6)}
                    </td>
                    <td className="px-5 py-3 text-zinc-400 text-xs">
                      {loc.accuracy != null
                        ? `${loc.accuracy.toFixed(1)} m`
                        : "—"}
                    </td>
                    <td className="px-5 py-3">
                      {loc.latitude != null && loc.longitude != null ? (
                        <a
                          href={`https://www.openstreetmap.org/?mlat=${loc.latitude}&mlon=${loc.longitude}#map=16/${loc.latitude}/${loc.longitude}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[#00a2ff] hover:underline text-xs font-bold"
                        >
                          Haritada Gör
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-5 py-3 text-zinc-500 text-[11px]">
                      {loc.timestamp
                        ? new Date(loc.timestamp).toLocaleString("tr-TR")
                        : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const APPS_API = BACKEND_URL;
const APPS_PROFILE = "default";

const RISK_APPS = new Set([
  "tinder",
  "badoo",
  "grindr",
  "onlyfans",
  "snapchat",
]);

function UsageBar({ minutes, limitMin }) {
  if (!minutes && !limitMin) return null;
  const pct = limitMin
    ? Math.min(100, Math.round((minutes / limitMin) * 100))
    : null;
  const color =
    pct == null
      ? "bg-[#00a2ff]"
      : pct >= 100
        ? "bg-red-500"
        : pct >= 75
          ? "bg-amber-500"
          : "bg-emerald-500";
  return (
    <div className="flex items-center gap-2 text-[10px] text-zinc-500 mt-1">
      <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{
            width: pct != null ? `${pct}%` : "100%",
            maxWidth: "100%",
            opacity: pct == null ? 0.4 : 1,
          }}
        />
      </div>
      <span>
        {minutes}dk{limitMin ? ` / ${limitMin}dk` : ""}
      </span>
    </div>
  );
}

function LimitModal({ app, limit, onSave, onDelete, onClose }) {
  const [dailyMin, setDailyMin] = useState(limit?.daily_limit_min ?? "");
  const [allowFrom, setAllowFrom] = useState(limit?.allow_from ?? "");
  const [allowUntil, setAllowUntil] = useState(limit?.allow_until ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    await apiFetch(`${APPS_API}/api/app-limits/${APPS_PROFILE}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app_name: app,
        daily_limit_min: dailyMin !== "" ? Number(dailyMin) : null,
        allow_from: allowFrom || null,
        allow_until: allowUntil || null,
      }),
    });
    setSaving(false);
    onSave();
  };

  const remove = async () => {
    await apiFetch(
      `${APPS_API}/api/app-limits/${APPS_PROFILE}/${encodeURIComponent(app)}`,
      { method: "DELETE" },
    );
    onDelete();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-80 shadow-2xl">
        <div className="flex justify-between items-center mb-5">
          <h3 className="font-bold text-sm text-zinc-200">
            Limit Tanımla — {app}
          </h3>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold block mb-1">
              Günlük Maks. Kullanım (dakika)
            </label>
            <input
              type="number"
              min="1"
              max="1440"
              value={dailyMin}
              onChange={(e) => setDailyMin(e.target.value)}
              placeholder="Sınırsız"
              className="w-full bg-zinc-950 border border-zinc-800 focus:border-[#00a2ff]/50 focus:outline-none rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600"
            />
          </div>

          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold block mb-1">
              İzin Verilen Saat Aralığı
            </label>
            <div className="flex items-center gap-2">
              <input
                type="time"
                value={allowFrom}
                onChange={(e) => setAllowFrom(e.target.value)}
                className="flex-1 bg-zinc-950 border border-zinc-800 focus:border-[#00a2ff]/50 focus:outline-none rounded-lg px-3 py-2 text-sm text-zinc-200"
              />
              <span className="text-zinc-600 text-xs">—</span>
              <input
                type="time"
                value={allowUntil}
                onChange={(e) => setAllowUntil(e.target.value)}
                className="flex-1 bg-zinc-950 border border-zinc-800 focus:border-[#00a2ff]/50 focus:outline-none rounded-lg px-3 py-2 text-sm text-zinc-200"
              />
            </div>
            <p className="text-[10px] text-zinc-600 mt-1">
              Boş bırakılırsa saat kısıtlaması uygulanmaz.
            </p>
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 bg-[#00a2ff] hover:bg-[#0090e0] disabled:opacity-50 text-white rounded-lg py-2 text-xs font-bold transition-colors"
          >
            {saving ? "Kaydediliyor…" : "Kaydet"}
          </button>
          {limit && (
            <button
              onClick={remove}
              className="px-3 py-2 bg-zinc-800 hover:bg-red-500/20 border border-zinc-700 hover:border-red-500/40 text-zinc-400 hover:text-red-400 rounded-lg text-xs transition-colors"
            >
              Kaldır
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export const InstalledAppsView = () => {
  const [apps, setApps] = useState([]);
  const [usage, setUsage] = useState({});
  const [limits, setLimits] = useState({});
  const [modal, setModal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);

  const reload = useCallback(() => setRefresh((n) => n + 1), []);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      try {
        const [appsRes, usageRes, limitsRes] = await Promise.all([
          apiFetch(`${APPS_API}/api/apps/${APPS_PROFILE}`),
          apiFetch(
            `${APPS_API}/api/app-usage/${APPS_PROFILE}?date=${new Date().toISOString().split("T")[0]}`,
          ),
          apiFetch(`${APPS_API}/api/app-limits/${APPS_PROFILE}`),
        ]);
        if (!alive) return;
        if (appsRes.ok) {
          const d = await appsRes.json();
          setApps(Array.isArray(d) ? d : []);
        }
        if (usageRes.ok) {
          const list = await usageRes.json();
          if (Array.isArray(list))
            setUsage(Object.fromEntries(list.map((u) => [u.app_name, u])));
        }
        if (limitsRes.ok) {
          const list = await limitsRes.json();
          if (Array.isArray(list))
            setLimits(Object.fromEntries(list.map((l) => [l.app_name, l])));
        }
      } catch {
        /* backend offline → empty state */
      }
      if (alive) setLoading(false);
    }
    load();
    return () => {
      alive = false;
    };
  }, [refresh]);

  // Eğer backend'den app listesi boşsa fallback göster
  const displayApps = apps.length
    ? apps
    : [
        "WhatsApp",
        "Snapchat",
        "Instagram",
        "Facebook",
        "Tinder",
        "YouTube",
        "TikTok",
        "Netflix",
      ].map((n) => ({ name: n, bundle_id: n.toLowerCase() }));

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-300">
      <TopBar title="Installed Apps & Digital Detox" />

      {modal && (
        <LimitModal
          app={modal}
          limit={limits[modal] || null}
          onSave={() => {
            setModal(null);
            reload();
          }}
          onDelete={() => {
            setModal(null);
            reload();
          }}
          onClose={() => setModal(null)}
        />
      )}

      <div className="p-6 flex-1 overflow-y-auto">
        {/* Özet */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: "Toplam Uygulama", value: displayApps.length },
            { label: "Limit Tanımlı", value: Object.keys(limits).length },
            { label: "Bugün Aktif", value: Object.keys(usage).length },
          ].map((s) => (
            <div
              key={s.label}
              className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-center"
            >
              <div className="text-2xl font-bold text-zinc-100">{s.value}</div>
              <div className="text-[10px] text-zinc-500 mt-1 uppercase tracking-wider">
                {s.label}
              </div>
            </div>
          ))}
        </div>

        <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-800/50 text-zinc-400 font-semibold border-b border-zinc-800">
              <tr>
                <th className="px-5 py-3 w-12">App</th>
                <th className="px-5 py-3">İsim</th>
                <th className="px-5 py-3 w-44">Bugünkü Kullanım</th>
                <th className="px-5 py-3 w-28 text-center">Limit</th>
                <th className="px-5 py-3 w-32 text-right">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {loading ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-8 text-center text-zinc-600"
                  >
                    Yükleniyor…
                  </td>
                </tr>
              ) : (
                displayApps.map((app, idx) => {
                  const name = app.name || app.app_name || String(app);
                  const u = usage[name];
                  const lim = limits[name];
                  const isRisky = RISK_APPS.has(name.toLowerCase());
                  const overLimit =
                    lim?.daily_limit_min && u?.minutes >= lim.daily_limit_min;
                  return (
                    <tr
                      key={idx}
                      className={`hover:bg-zinc-800/30 transition-colors ${overLimit ? "bg-red-500/5" : ""}`}
                    >
                      <td className="px-5 py-3">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs border
                        ${isRisky ? "bg-red-500/10 border-red-500/30 text-red-400" : "bg-zinc-800 border-zinc-700 text-zinc-400"}`}
                        >
                          {name[0].toUpperCase()}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="font-medium text-zinc-200">{name}</div>
                        {isRisky && (
                          <div className="text-[10px] text-red-400 mt-0.5">
                            Riskli Uygulama
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <UsageBar
                          minutes={u?.minutes || 0}
                          limitMin={lim?.daily_limit_min}
                        />
                      </td>
                      <td className="px-5 py-3 text-center">
                        {lim ? (
                          <div className="text-[10px] text-zinc-400 space-y-0.5">
                            {lim.daily_limit_min && (
                              <div className="text-amber-400 font-bold">
                                {lim.daily_limit_min}dk/gün
                              </div>
                            )}
                            {lim.allow_from && (
                              <div>
                                {lim.allow_from}–{lim.allow_until}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-[10px] text-zinc-600">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={() => setModal(name)}
                          className="text-[10px] px-3 py-1.5 rounded-lg border border-zinc-700 hover:border-[#00a2ff]/50 text-zinc-400 hover:text-[#00a2ff] transition-colors font-semibold"
                        >
                          {lim ? "Düzenle" : "Limit Tanımla"}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export const LoggerView = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterApp, setFilterApp] = useState("Tümü");

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const r = await apiFetch(
          `${COMMS_API}/api/keystrokes/${COMMS_PROFILE}?limit=300`,
        );
        if (alive && r.ok) {
          const d = await r.json();
          setLogs(Array.isArray(d) ? d : []);
        }
      } catch (err) {
        console.error("Logger fetch error:", err);
      }
      if (alive) setLoading(false);
    }
    load();
    const t = setInterval(load, 10000); // 10 saniyede bir güncelle
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const apps = ["Tümü", ...new Set(logs.map((l) => l.app_name))];
  const filtered =
    filterApp === "Tümü" ? logs : logs.filter((l) => l.app_name === filterApp);

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-300 font-sans">
      <TopBar title="Klavye Takibi (Sessiz Dinleme)" />

      <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
        {/* Filtre ve Özet */}
        <div className="flex flex-col md:flex-row gap-4 mb-8 items-start md:items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2 flex flex-col w-64 shadow-lg">
              <span className="text-[10px] text-zinc-500 uppercase font-black tracking-widest mb-1">
                Uygulama Filtresi
              </span>
              <select
                value={filterApp}
                onChange={(e) => setFilterApp(e.target.value)}
                className="bg-transparent text-zinc-100 text-sm focus:outline-none appearance-none cursor-pointer font-bold"
              >
                {apps.map((app) => (
                  <option
                    key={app}
                    value={app}
                    className="bg-zinc-900 text-zinc-200"
                  >
                    {app}
                  </option>
                ))}
              </select>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2 flex flex-col shadow-lg">
              <span className="text-[10px] text-zinc-500 uppercase font-black tracking-widest mb-1">
                Toplam Kayıt
              </span>
              <span className="text-sm font-black text-[#00a2ff]">
                {filtered.length} Olay
              </span>
            </div>
          </div>

          <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-[0.2em] bg-zinc-900/50 px-3 py-1 rounded-full border border-zinc-800">
            Gerçek Zamanlı İzleme Aktif
          </div>
        </div>

        {/* Timeline View */}
        <div className="relative">
          {/* Vertical Line */}
          <div className="absolute left-[21px] top-0 bottom-0 w-0.5 bg-gradient-to-b from-[#00a2ff]/20 via-zinc-800 to-transparent"></div>

          <div className="space-y-6">
            {loading ? (
              <div className="ml-12 py-12 text-zinc-600 animate-pulse font-bold uppercase tracking-widest text-xs">
                Veriler Alınıyor...
              </div>
            ) : filtered.length === 0 ? (
              <div className="ml-12 py-12 text-zinc-600 font-bold uppercase tracking-widest text-xs">
                Henüz klavye kaydı bulunamadı.
              </div>
            ) : (
              filtered.map((row, idx) => {
                const date = new Date(row.timestamp);
                const timeStr = date.toLocaleTimeString("tr-TR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                });
                const dateStr = date.toLocaleDateString("tr-TR", {
                  day: "numeric",
                  month: "short",
                });
                const isRisk =
                  row.is_risk_alert === 1 || row.is_risk_alert === true;

                return (
                  <div
                    key={idx}
                    className="relative flex items-start gap-6 group"
                  >
                    {/* Circle Indicator */}
                    <div
                      className={`z-10 w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border-2 shadow-xl transition-all duration-300 group-hover:scale-110 ${
                        isRisk
                          ? "bg-red-500/10 border-red-500/30 text-red-400"
                          : "bg-zinc-900 border-zinc-800 text-[#00a2ff]"
                      }`}
                    >
                      {row.app_name[0].toUpperCase()}
                    </div>

                    {/* Content Card */}
                    <div
                      className={`flex-1 premium-card p-5 group-hover:border-[#00a2ff]/30 transition-all ${isRisk ? "bg-red-500/5 border-red-500/10" : ""}`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-zinc-100 uppercase tracking-tight">
                            {row.app_name}
                          </span>
                          <span className="text-[10px] text-zinc-500">•</span>
                          <span className="text-[10px] text-zinc-500 font-bold">
                            {timeStr}
                          </span>
                        </div>
                        <div className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">
                          {dateStr}
                        </div>
                      </div>
                      <p
                        className={`text-sm leading-relaxed font-medium ${isRisk ? "text-red-200" : "text-zinc-300"}`}
                      >
                        {row.text}
                      </p>

                      {isRisk && (
                        <div className="mt-3 flex items-center gap-2 text-[9px] font-black text-red-500 uppercase tracking-widest">
                          <ShieldAlert className="w-3 h-3" /> Kritik İçerik
                          Tespit Edildi
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const GeoFencingView = () => {
  const [zones, setZones] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    name: "",
    latitude: "",
    longitude: "",
    radius_meters: "200",
  });
  const [saving, setSaving] = useState(false);

  async function loadData() {
    try {
      const [zRes, aRes] = await Promise.all([
        apiFetch(`${BACKEND_URL}/api/zones/${COMMS_PROFILE}`),
        apiFetch(`${BACKEND_URL}/api/zones/${COMMS_PROFILE}/alerts`),
      ]);
      if (!zRes.ok) throw new Error(`Bölgeler: HTTP ${zRes.status}`);
      if (!aRes.ok) throw new Error(`Uyarılar: HTTP ${aRes.status}`);
      const [zData, aData] = await Promise.all([zRes.json(), aRes.json()]);
      setZones(Array.isArray(zData) ? zData : []);
      setAlerts(Array.isArray(aData) ? aData : []);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    const t = setInterval(loadData, 30000);
    return () => clearInterval(t);
  }, []);

  async function addZone(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await apiFetch(`${BACKEND_URL}/api/zones/${COMMS_PROFILE}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          latitude: parseFloat(form.latitude),
          longitude: parseFloat(form.longitude),
          radius_meters: parseFloat(form.radius_meters) || 200,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setForm({ name: "", latitude: "", longitude: "", radius_meters: "200" });
      setShowAdd(false);
      await loadData();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteZone(zone_id) {
    try {
      const res = await apiFetch(
        `${BACKEND_URL}/api/zones/${COMMS_PROFILE}/${zone_id}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setZones((prev) => prev.filter((z) => z.zone_id !== zone_id));
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-300">
      <TopBar title="Güvenli Bölge (Geofencing)" />
      {error && (
        <div className="mx-6 mt-4 p-3 rounded-xl border border-red-500/30 bg-red-500/5 text-red-400 text-xs">
          {error}
        </div>
      )}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Zone List */}
        <div className="w-[320px] bg-zinc-900 border-r border-zinc-800 flex flex-col">
          <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-widest text-zinc-400">
              Güvenli Bölgeler ({zones.length})
            </span>
            {loading && (
              <RefreshCw className="w-3 h-3 text-zinc-600 animate-spin" />
            )}
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {zones.length === 0 && !loading && (
              <div className="p-6 text-center text-zinc-600 text-xs">
                Henüz güvenli bölge yok.
              </div>
            )}
            {zones.map((z) => (
              <div
                key={z.zone_id}
                className="flex items-start gap-3 p-4 border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors group"
              >
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5">
                  <MapPin className="w-4 h-4 text-emerald-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm text-zinc-200 truncate">
                    {z.name}
                  </div>
                  <div className="text-[10px] text-zinc-500 mt-0.5 font-mono">
                    {z.latitude.toFixed(5)}, {z.longitude.toFixed(5)}
                  </div>
                  <div className="text-[10px] text-zinc-600 mt-0.5">
                    Yarıçap: {z.radius_meters} m
                  </div>
                </div>
                <button
                  onClick={() => deleteZone(z.zone_id)}
                  className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-500/10 rounded-lg transition-all"
                  title="Sil"
                >
                  <X className="w-4 h-4 text-red-400" />
                </button>
              </div>
            ))}
          </div>
          <div className="p-4 border-t border-zinc-800">
            <button
              onClick={() => setShowAdd((v) => !v)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 text-xs font-black uppercase tracking-widest transition-colors"
            >
              <Plus className="w-4 h-4" /> Bölge Ekle
            </button>
          </div>
        </div>

        {/* Right Panel */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {showAdd ? (
            /* Add Zone Form */
            <div className="flex-1 p-8 max-w-lg">
              <h3 className="text-sm font-black uppercase tracking-widest text-zinc-300 mb-6 flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-500" /> Yeni Güvenli Bölge
              </h3>
              <form onSubmit={addZone} className="space-y-4">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 block mb-1.5">
                    Bölge Adı
                  </label>
                  <input
                    required
                    value={form.name}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, name: e.target.value }))
                    }
                    placeholder="Ev, Okul, İş..."
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 block mb-1.5">
                      Enlem
                    </label>
                    <input
                      required
                      type="number"
                      step="any"
                      value={form.latitude}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, latitude: e.target.value }))
                      }
                      placeholder="41.0082"
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 block mb-1.5">
                      Boylam
                    </label>
                    <input
                      required
                      type="number"
                      step="any"
                      value={form.longitude}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, longitude: e.target.value }))
                      }
                      placeholder="28.9784"
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 block mb-1.5">
                    Yarıçap (metre)
                  </label>
                  <input
                    required
                    type="number"
                    min="50"
                    max="5000"
                    value={form.radius_meters}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, radius_meters: e.target.value }))
                    }
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500/50"
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs uppercase tracking-widest transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {saving ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      <Plus className="w-3 h-3" />
                    )}
                    Kaydet
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAdd(false)}
                    className="px-6 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 font-bold text-xs transition-colors"
                  >
                    İptal
                  </button>
                </div>
              </form>
            </div>
          ) : (
            /* Alerts Panel */
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="p-4 border-b border-zinc-800 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-black uppercase tracking-widest text-zinc-400">
                  Bölge Uyarıları ({alerts.length})
                </span>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                {alerts.length === 0 && !loading && (
                  <div className="text-center text-zinc-600 text-sm py-12">
                    Henüz uyarı yok.
                  </div>
                )}
                {[...alerts].reverse().map((al, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-3 p-4 rounded-xl border ${
                      al.event === "exited"
                        ? "bg-red-500/5 border-red-500/20"
                        : "bg-emerald-500/5 border-emerald-500/20"
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        al.event === "exited"
                          ? "bg-red-500/10"
                          : "bg-emerald-500/10"
                      }`}
                    >
                      <MapPin
                        className={`w-4 h-4 ${al.event === "exited" ? "text-red-400" : "text-emerald-400"}`}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span
                          className={`text-[9px] font-black uppercase tracking-widest ${
                            al.event === "exited"
                              ? "text-red-400"
                              : "text-emerald-400"
                          }`}
                        >
                          {al.event === "exited"
                            ? "⚠ Bölge Çıkışı"
                            : "✓ Bölge Girişi"}
                        </span>
                      </div>
                      <div className="text-sm font-bold text-zinc-200">
                        {al.zone_name}
                      </div>
                      <div className="text-[10px] text-zinc-500 mt-0.5 font-mono">
                        {al.latitude?.toFixed(5)}, {al.longitude?.toFixed(5)}
                        {al.timestamp
                          ? ` · ${new Date(al.timestamp).toLocaleString("tr-TR")}`
                          : ""}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* --- NEW VIEWS FROM LATEST SCREENSHOTS --- */

export const BlockCallsView = () => {
  const [config, setConfig] = useState(null);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);

  const blocked = config?.blocked_phones ?? [];

  useEffect(() => {
    apiFetch(`${COMMS_API}/api/restrictions/${COMMS_PROFILE}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setConfig(d);
      });
  }, []);

  const save = async (updated) => {
    setSaving(true);
    try {
      await apiFetch(`${COMMS_API}/api/restrictions/${COMMS_PROFILE}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });
      setConfig(updated);
    } finally {
      setSaving(false);
    }
  };

  const addPhone = () => {
    if (!input.trim() || !config) return;
    save({ ...config, blocked_phones: [...blocked, input.trim()] });
    setInput("");
  };

  const removePhone = (num) => {
    if (!config) return;
    save({ ...config, blocked_phones: blocked.filter((p) => p !== num) });
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-300">
      <TopBar title="Engellenen Aramalar" />
      <div className="p-6 flex-1 overflow-y-auto space-y-6">
        <div className="premium-card p-6">
          <h3 className="text-xs font-black text-zinc-500 uppercase tracking-[0.2em] mb-4">
            Numara Ekle
          </h3>
          <div className="flex gap-4">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addPhone()}
              placeholder="Telefon numarası girin"
              className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#00a2ff]/50 transition-all"
            />
            <button
              onClick={addPhone}
              disabled={saving || !input.trim()}
              className="bg-[#00a2ff] hover:bg-[#008de6] disabled:opacity-40 text-white px-8 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all"
            >
              Engelle
            </button>
          </div>
        </div>
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-800/50 text-zinc-400 font-semibold border-b border-zinc-800">
              <tr>
                <th className="px-6 py-4">Engellenen Numara</th>
                <th className="px-6 py-4 text-right">Kaldır</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {blocked.length === 0 ? (
                <tr>
                  <td
                    colSpan={2}
                    className="px-6 py-8 text-center text-zinc-600"
                  >
                    Engellenen numara yok.
                  </td>
                </tr>
              ) : (
                blocked.map((num) => (
                  <tr
                    key={num}
                    className="hover:bg-zinc-800/30 transition-colors"
                  >
                    <td className="px-6 py-4 font-mono">{num}</td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => removePhone(num)}>
                        <X className="w-4 h-4 text-red-500 hover:text-red-400" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export const BrowserHistoryView = () => {
  const [items, setItems] = useState([]);
  const [flagged, setFlagged] = useState([]);
  const [tab, setTab] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      try {
        const [hRes, fRes] = await Promise.all([
          apiFetch(`${COMMS_API}/api/browser/${COMMS_PROFILE}?limit=200`),
          apiFetch(`${COMMS_API}/api/browser/${COMMS_PROFILE}/flagged`),
        ]);
        if (alive && hRes.ok) {
          const d = await hRes.json();
          setItems(Array.isArray(d) ? d : (d?.items ?? []));
        }
        if (alive && fRes.ok) {
          const d = await fRes.json();
          setFlagged(Array.isArray(d) ? d : (d?.items ?? []));
        }
      } catch {
        /* offline */
      }
      if (alive) setLoading(false);
    }
    load();
    return () => {
      alive = false;
    };
  }, []);

  const rows = tab === "flagged" ? flagged : items;
  const RISK_COLOR = {
    high: "text-red-400",
    medium: "text-amber-400",
    low: "text-yellow-400",
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-300">
      <TopBar title="Tarayıcı Geçmişi" />
      <div className="p-6 flex-1 overflow-y-auto space-y-4">
        <div className="flex border-b border-zinc-800">
          {[
            ["all", "Tüm Geçmiş"],
            ["flagged", "⚠️ Riskli Siteler"],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-5 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors ${tab === key ? "text-[#00a2ff] border-b-2 border-[#00a2ff]" : "text-zinc-500 hover:text-zinc-300"}`}
            >
              {label}
              {key === "flagged" && flagged.length > 0 && (
                <span className="ml-2 px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded text-[9px]">
                  {flagged.length}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-800/50 text-zinc-400 font-semibold border-b border-zinc-800">
              <tr>
                <th className="px-5 py-3">Başlık</th>
                <th className="px-5 py-3">URL</th>
                <th className="px-5 py-3 w-28">Risk</th>
                <th className="px-5 py-3 w-36">Ziyaret</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {loading ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-5 py-8 text-center text-zinc-600"
                  >
                    Yükleniyor…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-5 py-8 text-center text-zinc-600"
                  >
                    Kayıt bulunamadı.
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr
                    key={i}
                    className={`hover:bg-zinc-800/30 transition-colors ${r.risk_level === "high" ? "bg-red-500/5" : ""}`}
                  >
                    <td className="px-5 py-3 text-zinc-200 max-w-[180px] truncate">
                      {r.title || "—"}
                    </td>
                    <td className="px-5 py-3 max-w-xs truncate">
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#00a2ff] hover:underline text-xs font-mono"
                      >
                        {r.url}
                      </a>
                    </td>
                    <td className="px-5 py-3">
                      {r.risk_level && r.risk_level !== "none" ? (
                        <span
                          className={`text-[10px] font-bold uppercase ${RISK_COLOR[r.risk_level] || ""}`}
                        >
                          {r.risk_level}
                        </span>
                      ) : (
                        <span className="text-zinc-600 text-[10px]">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-zinc-500 text-[11px]">
                      {r.visit_time
                        ? new Date(r.visit_time).toLocaleString("tr-TR")
                        : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export const BrowserBookmarkView = () => {
  const [bookmarks, setBookmarks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      try {
        const res = await apiFetch(
          `${COMMS_API}/api/bookmarks/${COMMS_PROFILE}?limit=200`,
        );
        if (alive && res.ok) {
          const d = await res.json();
          setBookmarks(Array.isArray(d) ? d : []);
        }
      } catch {
        /* offline */
      }
      if (alive) setLoading(false);
    }
    load();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-300">
      <TopBar title="Yer İmleri" />
      <div className="p-6 flex-1 overflow-y-auto">
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-800/50 text-zinc-400 font-semibold border-b border-zinc-800">
              <tr>
                <th className="px-6 py-4">Başlık</th>
                <th className="px-6 py-4">URL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {loading ? (
                <tr>
                  <td
                    colSpan={2}
                    className="px-6 py-8 text-center text-zinc-600"
                  >
                    Yükleniyor…
                  </td>
                </tr>
              ) : bookmarks.length === 0 ? (
                <tr>
                  <td
                    colSpan={2}
                    className="px-6 py-8 text-center text-zinc-600"
                  >
                    Yer imi bulunamadı.
                  </td>
                </tr>
              ) : (
                bookmarks.map((bm, i) => (
                  <tr
                    key={i}
                    className="hover:bg-zinc-800/30 transition-colors"
                  >
                    <td className="px-6 py-4 text-zinc-200">
                      {bm.title || "—"}
                    </td>
                    <td className="px-6 py-4">
                      <a
                        href={bm.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#00a2ff] hover:underline text-xs font-mono truncate block max-w-xs"
                      >
                        {bm.url}
                      </a>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export const EmailView = () => {
  const [emails, setEmails] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      try {
        const res = await apiFetch(
          `${COMMS_API}/api/emails/${COMMS_PROFILE}?max_results=50`,
        );
        if (alive && res.ok) {
          const d = await res.json();
          const arr = Array.isArray(d) ? d : (d?.emails ?? []);
          setEmails(arr);
          if (arr.length > 0) setSelected(arr[0]);
        }
      } catch {
        /* offline */
      }
      if (alive) setLoading(false);
    }
    load();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-300">
      <TopBar title="E-Posta" />
      <div className="flex flex-1 overflow-hidden">
        <div className="w-[350px] bg-zinc-900 border-r border-zinc-800 flex flex-col">
          <div className="p-4 border-b border-zinc-800 text-[10px] font-black text-zinc-500 uppercase tracking-widest">
            Gmail Gelen Kutusu
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-6 text-center text-zinc-600 text-xs animate-pulse">
                Yükleniyor…
              </div>
            ) : emails.length === 0 ? (
              <div className="p-6 text-center text-zinc-600 text-xs">
                E-posta bulunamadı.
              </div>
            ) : (
              emails.map((e, i) => (
                <div
                  key={e.message_id ?? i}
                  onClick={() => setSelected(e)}
                  className={`p-4 border-b border-zinc-800 cursor-pointer transition-colors ${selected?.message_id === e.message_id ? "bg-[#00a2ff] text-white" : "hover:bg-zinc-800/50"}`}
                >
                  <div
                    className={`font-semibold mb-1 truncate text-sm ${selected?.message_id === e.message_id ? "text-white" : "text-zinc-200"}`}
                  >
                    {e.sender || "?"}
                  </div>
                  <div
                    className={`text-xs truncate ${selected?.message_id === e.message_id ? "text-white/90" : "text-zinc-400"}`}
                  >
                    {e.subject || "(Konu yok)"}
                  </div>
                  <div
                    className={`text-[10px] text-right mt-2 ${selected?.message_id === e.message_id ? "text-white/70" : "text-zinc-500"}`}
                  >
                    {e.date ? new Date(e.date).toLocaleString("tr-TR") : "—"}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="flex-1 bg-zinc-950 flex flex-col">
          {selected ? (
            <>
              <div className="p-6 border-b border-zinc-800 bg-zinc-900/50 text-sm space-y-1">
                <p>
                  <strong className="text-zinc-400">Kimden:</strong>{" "}
                  <span className="text-zinc-200">{selected.sender}</span>
                </p>
                <p>
                  <strong className="text-zinc-400">Konu:</strong>{" "}
                  <span className="text-zinc-200">{selected.subject}</span>
                </p>
                <p>
                  <strong className="text-zinc-400">Tarih:</strong>{" "}
                  <span className="text-zinc-400">
                    {selected.date
                      ? new Date(selected.date).toLocaleString("tr-TR")
                      : "—"}
                  </span>
                </p>
              </div>
              <div className="flex-1 overflow-y-auto p-8">
                <p className="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap">
                  {selected.snippet}
                </p>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-zinc-600 text-xs">
              Sol panelden bir e-posta seçin.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const ViberView = () => (
  <div className="flex flex-col h-full bg-zinc-950 text-zinc-300">
    <TopBar title="Viber" />
    <div className="flex-1 flex items-center justify-center text-zinc-600 flex-col gap-3">
      <MessageSquare className="w-10 h-10 opacity-30" />
      <p className="text-sm">
        Viber entegrasyonu bu cihaz için henüz desteklenmiyor.
      </p>
    </div>
  </div>
);

const DIAG_PROFILE = "default";
// Port 8001 yerine port 8000 (backend) üzerinden stream — firewall sorununu önler
const DIAG_BASE = BACKEND_URL;

function relativeTime(ms) {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 5) return "Just now";
  if (s < 60) return `${s}s ago`;
  return `${Math.round(s / 60)}m ago`;
}

export const LiveControlView = () => {
  const [activeStream, setActiveStream] = useState("none");
  const [isConnected, setIsConnected] = useState(false);
  const [peerConnected, setPeerConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingUrl, setRecordingUrl] = useState(null);
  const [recSecs, setRecSecs] = useState(0);
  const recTimerRef = useRef(null);
  const [snapshot, setSnapshot] = useState(null);
  const [liveFrame, setLiveFrame] = useState(null);
  const [frameRate, setFrameRate] = useState(0);
  const [panicMessage, setPanicMessage] = useState("");
  const [alertActive, setAlertActive] = useState(false);
  const [deviceDiags, setDeviceDiags] = useState([]);

  const socketRef = useRef(null);
  const peerRef = useRef(null);
  const videoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const frameCountRef = useRef(0);
  const frameTimerRef = useRef(null);
  const lastFrameTimeRef = useRef(0);
  const pollTimerRef = useRef(null);
  const audioCtxRef = useRef(null);

  const downloadRecording = () => {
    if (recordingUrl) {
      const link = document.createElement("a");
      link.href = recordingUrl;
      link.download = `recording-${Date.now()}.webm`;
      link.click();
    }
  };

  const stopRecording = () => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(recTimerRef.current);
    }
  };

  const startRecording = (stream) => {
    chunksRef.current = [];
    const preferred = "video/webm;codecs=vp9,opus";
    const mimeType = MediaRecorder.isTypeSupported(preferred) ? preferred : "";
    let recorder;
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
    } catch {
      return;
    }
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      setRecordingUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
    };

    recorder.start();
    setIsRecording(true);
    setRecordingUrl(null);
    setRecSecs(0);
    recTimerRef.current = setInterval(() => setRecSecs((s) => s + 1), 1000);
  };

  const destroyPeer = () => {
    stopRecording();
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setPeerConnected(false);
  };

  useEffect(() => {
    const socket = io(BACKEND_URL, {
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 8000,
      timeout: 10000,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setIsConnected(true);
      socket.emit("register", "dashboard");
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
      setPeerConnected(false);
    });

    socket.on("connect_error", (err) => {
      console.warn("[LiveControl] Signal server bağlantı hatası:", err.message);
      setIsConnected(false);
    });

    // Mobil cihazdan gelen WebRTC offer
    socket.on("offer", ({ caller, sdp }) => {
      destroyPeer();
      const peer = new SimplePeer({ initiator: false, trickle: true });
      peerRef.current = peer;

      peer.signal(sdp);

      peer.on("signal", (data) => {
        if (data.type === "answer") {
          socket.emit("answer", { target: caller, sdp: data });
        } else if (data.type === "candidate") {
          socket.emit("ice-candidate", {
            target: caller,
            candidate: data.candidate,
          });
        }
      });

      peer.on("stream", (stream) => {
        if (videoRef.current) videoRef.current.srcObject = stream;
        setPeerConnected(true);
        startRecording(stream);
      });

      peer.on("track", (track, stream) => {
        if (videoRef.current && !videoRef.current.srcObject) {
          videoRef.current.srcObject = stream;
          setPeerConnected(true);
          startRecording(stream);
        }
      });

      peer.on("close", () => {
        setPeerConnected(false);
        setActiveStream("none");
        stopRecording();
      });
      peer.on("error", () => {
        setPeerConnected(false);
        stopRecording();
      });
    });

    // Mobil cihazdan gelen ICE candidate
    socket.on("ice-candidate", ({ candidate }) => {
      if (peerRef.current && candidate) peerRef.current.signal(candidate);
    });

    // Fotoğraf snapshot (tek kare — "Take Photo" sonucu)
    socket.on("snapshot", (payload) => {
      const data = payload?.data || payload;
      if (data) setSnapshot(typeof data === "string" ? data : null);
      setActiveStream("none");
      setLiveFrame(null);
    });

    // Canlı ekran akışı (base64 JPEG kareler — ~2-3 FPS)
    socket.on("screen_frame", (payload) => {
      const frame = payload?.frame || payload;
      if (!frame) return;
      const src = frame.startsWith("data:")
        ? frame
        : `data:image/jpeg;base64,${frame}`;
      setLiveFrame(src);
      setActiveStream((prev) => (prev !== "screen" ? "screen" : prev));
      setPeerConnected(true);
      frameCountRef.current += 1;
      lastFrameTimeRef.current = Date.now();
    });

    // Canlı kamera akışı (Camera2 base64 JPEG)
    socket.on("camera_frame", (payload) => {
      const frame = payload?.frame || payload;
      if (!frame) return;
      const src = frame.startsWith("data:")
        ? frame
        : `data:image/jpeg;base64,${frame}`;
      setLiveFrame(src);
      setActiveStream((prev) => (prev !== "camera" ? "camera" : prev));
      setPeerConnected(true);
      frameCountRef.current += 1;
      lastFrameTimeRef.current = Date.now();
    });

    // Canlı mikrofon akışı (PCM 16-bit 16kHz base64 chunk)
    socket.on("audio_frame", (payload) => {
      if (!payload?.chunk) return;
      try {
        if (!audioCtxRef.current) {
          audioCtxRef.current = new (
            window.AudioContext || window.webkitAudioContext
          )({
            sampleRate: payload.sampleRate || 16000,
          });
        }
        const ctx = audioCtxRef.current;
        if (ctx.state === "suspended") ctx.resume();

        const binary = atob(payload.chunk);
        const pcmBytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++)
          pcmBytes[i] = binary.charCodeAt(i);

        const numSamples = pcmBytes.length / 2;
        const float32 = new Float32Array(numSamples);
        const view = new DataView(pcmBytes.buffer);
        for (let i = 0; i < numSamples; i++) {
          float32[i] = view.getInt16(i * 2, true) / 32768.0;
        }

        const audioBuffer = ctx.createBuffer(
          1,
          numSamples,
          payload.sampleRate || 16000,
        );
        audioBuffer.copyToChannel(float32, 0);
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        source.start();

        setActiveStream((prev) => (prev !== "audio" ? "audio" : prev));
      } catch (e) {
        console.error("Audio playback hatası:", e);
      }
    });

    // FPS ölçümü — her saniye
    frameTimerRef.current = setInterval(() => {
      setFrameRate(frameCountRef.current);
      frameCountRef.current = 0;
    }, 1000);

    // HTTP polling fallback — socket frame gelmezse 2s'de bir REST'ten çek
    pollTimerRef.current = setInterval(async () => {
      if (Date.now() - lastFrameTimeRef.current < 3000) return; // socket aktif
      try {
        const r = await apiFetch(
          `${BACKEND_URL}/api/screenshot/${DIAG_PROFILE}/live`,
        );
        if (!r.ok) return;
        const data = await r.json();
        if (!data?.frame) return;
        const src = data.frame.startsWith("data:")
          ? data.frame
          : `data:image/jpeg;base64,${data.frame}`;
        setLiveFrame(src);
        setActiveStream("screen");
        lastFrameTimeRef.current = Date.now();
      } catch (_) {}
    }, 2000);

    return () => {
      destroyPeer();
      socket.disconnect();
      clearInterval(frameTimerRef.current);
      clearInterval(pollTimerRef.current);
      setRecordingUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      if (audioCtxRef.current) {
        audioCtxRef.current.close();
        audioCtxRef.current = null;
      }
    };
  }, []);

  const sendCommand = (cmd) => {
    setLiveFrame(null);
    setSnapshot(null);
    setActiveStream(cmd);
    if (socketRef.current && isConnected) {
      socketRef.current.emit("command", {
        type: cmd,
        profileId: DIAG_PROFILE,
        from: socketRef.current.id,
        timestamp: Date.now(),
      });
    }
  };

  const stopStream = () => {
    destroyPeer();
    setActiveStream("none");
    setLiveFrame(null);
    setPeerConnected(false);
    if (socketRef.current)
      socketRef.current.emit("command", {
        type: "stop",
        from: socketRef.current.id,
      });
  };

  const sendAlert = (type, message) => {
    if (!socketRef.current || !isConnected) return;
    socketRef.current.emit("alert", {
      type,
      message,
      from: socketRef.current.id,
    });
    setAlertActive(type !== "clear");
  };

  // Fetch device diagnostics every 30s
  useEffect(() => {
    let alive = true;
    const load = () =>
      apiFetch(`${DIAG_BASE}/api/diagnostics/${DIAG_PROFILE}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((data) => {
          if (alive) setDeviceDiags(data);
        })
        .catch(() => {});
    load();
    const t = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-300">
      <TopBar title="Live Control Center (WebRTC)" />

      <div className="flex flex-1 p-6 gap-6 overflow-hidden">
        {/* Left Side: Video Player */}
        <div className="flex-1 flex flex-col bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden relative shadow-lg">
          {/* Header of Video Player */}
          <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/80 z-10">
            <div className="flex items-center gap-3">
              <div
                className={`w-2.5 h-2.5 rounded-full ${activeStream !== "none" ? "bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]" : "bg-zinc-600"}`}
              ></div>
              <span className="font-semibold text-sm">
                {activeStream === "none"
                  ? "Bağlantı Bekleniyor..."
                  : activeStream === "camera"
                    ? "Uzak Kamera Yayını (Aktif)"
                    : activeStream === "screen"
                      ? "Ekran Yansıtma (Aktif)"
                      : "Ortam Dinleme (Aktif)"}
              </span>
            </div>
            {activeStream !== "none" && (
              <div className="flex items-center gap-3">
                {recordingUrl && (
                  <button
                    onClick={downloadRecording}
                    className="text-[10px] bg-emerald-500 text-white px-2 py-1 rounded font-bold flex items-center gap-1 hover:bg-emerald-600 transition-colors"
                  >
                    <Download className="w-3 h-3" /> KAYDI İNDİR
                  </button>
                )}
                <span
                  className={`text-xs ${isRecording ? "bg-red-500/10 text-red-400 animate-pulse" : "bg-zinc-800 text-zinc-500"} px-2.5 py-1 rounded border border-red-500/20 font-mono flex items-center gap-1.5`}
                >
                  <div
                    className={`w-1.5 h-1.5 rounded-full ${isRecording ? "bg-red-500 animate-pulse" : "bg-zinc-600"}`}
                  ></div>
                  {isRecording
                    ? `KAYIT ${String(Math.floor(recSecs / 3600)).padStart(2, "0")}:${String(Math.floor(recSecs / 60) % 60).padStart(2, "0")}:${String(recSecs % 60).padStart(2, "0")}`
                    : "KAYIT DURDURULDU"}
                </span>
              </div>
            )}
          </div>

          {/* Video Area */}
          <div className="flex-1 bg-black flex items-center justify-center relative overflow-hidden">
            <div
              className="absolute inset-0 opacity-10"
              style={{
                backgroundImage:
                  "radial-gradient(circle at center, #ffffff 1px, transparent 1px)",
                backgroundSize: "24px 24px",
              }}
            ></div>

            {/* Snapshot (tek kare — Take Photo sonucu) */}
            {activeStream === "none" && snapshot ? (
              <div className="relative w-full h-full flex items-center justify-center">
                <img
                  src={snapshot}
                  alt="Snapshot"
                  className="max-w-full max-h-full object-contain"
                />
                <div className="absolute top-3 right-3 flex gap-2">
                  <a
                    href={snapshot}
                    download="snapshot.jpg"
                    className="text-[10px] bg-emerald-500 text-white px-2 py-1 rounded font-bold flex items-center gap-1 hover:bg-emerald-600"
                  >
                    <Download className="w-3 h-3" /> İNDİR
                  </a>
                  <button
                    onClick={() => setSnapshot(null)}
                    className="text-[10px] bg-zinc-700 text-white px-2 py-1 rounded font-bold hover:bg-zinc-600"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ) : /* Canlı ekran / kamera akışı (socket.io base64 JPEG) */
            (activeStream === "screen" || activeStream === "camera") &&
              liveFrame ? (
              <div className="relative w-full h-full">
                <img
                  src={liveFrame}
                  alt="Live stream"
                  className="absolute inset-0 w-full h-full object-contain bg-black"
                  style={{ imageRendering: "pixelated" }}
                />
                {/* FPS badge */}
                <div className="absolute top-3 left-3 bg-black/60 text-emerald-400 text-[9px] font-mono px-2 py-0.5 rounded">
                  {frameRate} FPS
                </div>
                {/* Stream type badge */}
                <div className="absolute top-3 right-3 bg-red-500/80 text-white text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider animate-pulse">
                  {activeStream === "screen" ? "📱 EKRAN" : "📷 KAMERA"}
                </div>
              </div>
            ) : /* Bekleme durumu */
            activeStream === "none" ? (
              <div className="text-center text-zinc-600 flex flex-col items-center z-10">
                <Radio className="w-16 h-16 mb-4 opacity-30" />
                <p className="text-sm uppercase tracking-[0.2em] font-bold">
                  {isConnected ? "Cihaz Komutu Bekleniyor" : "Signal Offline"}
                </p>
                <p className="text-xs mt-2 w-64 opacity-50">
                  {isConnected
                    ? "Live Screen veya Take Photo butonuna bas."
                    : "Sinyal sunucusuna bağlanılamıyor."}
                </p>
              </div>
            ) : /* Mikrofon modu */
            activeStream === "audio" ? (
              <div className="text-center text-[#00a2ff] flex flex-col items-center z-10">
                <Mic className="w-20 h-20 mb-8 animate-pulse drop-shadow-[0_0_15px_rgba(0,162,255,0.5)]" />
                <div className="flex gap-1.5 h-16 items-center">
                  {[55, 80, 35, 90, 60, 75, 40, 95, 50, 70, 45].map((h, i) => (
                    <div
                      key={i}
                      className="w-2 bg-[#00a2ff] rounded-full animate-pulse shadow-[0_0_5px_rgba(0,162,255,0.5)]"
                      style={{
                        height: `${h}%`,
                        animationDelay: `${i * 0.05}s`,
                        animationDuration: "0.5s",
                      }}
                    ></div>
                  ))}
                </div>
                <p className="text-xs mt-4 text-[#00a2ff]/60">
                  Ortam dinleniyor…
                </p>
              </div>
            ) : /* Photo isteği bekleniyor */
            activeStream === "photo" ? (
              <div className="text-center text-zinc-500 flex flex-col items-center z-10">
                <Camera className="w-16 h-16 mb-4 animate-pulse opacity-60" />
                <p className="text-sm uppercase tracking-[0.2em] font-bold">
                  Fotoğraf alınıyor…
                </p>
              </div>
            ) : (
              /* WebRTC peer stream (kamera/ses için) */
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className="absolute inset-0 w-full h-full object-contain bg-black"
              />
            )}
          </div>

          {/* Controls Overlay */}
          <div
            className={`absolute bottom-6 left-1/2 transform -translate-x-1/2 flex items-center gap-6 bg-zinc-900/80 border border-zinc-700 px-8 py-3 rounded-full backdrop-blur-md shadow-2xl transition-all duration-300 ${activeStream !== "none" ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"}`}
          >
            <button
              className="text-zinc-400 hover:text-white transition-colors"
              title="Sesi Kapat/Aç"
            >
              <Mic className="w-5 h-5" />
            </button>
            <button
              className="text-zinc-400 hover:text-white transition-colors"
              title="Tam Ekran"
            >
              <Maximize2 className="w-5 h-5" />
            </button>
            <div className="w-px h-6 bg-zinc-700 mx-2"></div>
            <button
              onClick={stopStream}
              className="w-10 h-10 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center text-white transition-all hover:scale-105 shadow-[0_0_10px_rgba(239,68,68,0.4)]"
              title="Yayını Durdur"
            >
              <div className="w-3.5 h-3.5 bg-white rounded-sm"></div>
            </button>
          </div>
        </div>

        {/* Right Side: Command Panel */}
        <div className="w-80 bg-zinc-900 border border-zinc-800 rounded-lg flex flex-col overflow-hidden shadow-lg">
          <div className="p-4 border-b border-zinc-800 bg-zinc-800/30">
            <h3 className="font-bold text-sm uppercase tracking-wider text-zinc-300 flex items-center gap-2">
              <MonitorPlay className="w-4 h-4 text-[#00a2ff]" /> Command Panel
            </h3>
          </div>

          <div className="p-4 flex-1 overflow-y-auto space-y-8">
            {/* Quick Actions */}
            <div>
              <p className="text-[10px] text-zinc-500 mb-3 uppercase tracking-widest font-bold">
                Stream Controls
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => sendCommand("screen")}
                  className={`flex flex-col items-center justify-center p-4 rounded-lg border transition-all duration-200 ${activeStream === "screen" ? "bg-[#00a2ff]/10 border-[#00a2ff] text-[#00a2ff] shadow-[inset_0_0_10px_rgba(0,162,255,0.1)]" : "bg-zinc-950 border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-300"}`}
                >
                  <MonitorPlay className="w-6 h-6 mb-2" />
                  <span className="text-[11px] font-semibold">Live Screen</span>
                </button>
                <button
                  onClick={() => sendCommand("camera")}
                  className={`flex flex-col items-center justify-center p-4 rounded-lg border transition-all duration-200 ${activeStream === "camera" ? "bg-[#00a2ff]/10 border-[#00a2ff] text-[#00a2ff] shadow-[inset_0_0_10px_rgba(0,162,255,0.1)]" : "bg-zinc-950 border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-300"}`}
                >
                  <Video className="w-6 h-6 mb-2" />
                  <span className="text-[11px] font-semibold">Live Camera</span>
                </button>
                <button
                  onClick={() => sendCommand("audio")}
                  className={`flex flex-col items-center justify-center p-4 rounded-lg border transition-all duration-200 ${activeStream === "audio" ? "bg-[#00a2ff]/10 border-[#00a2ff] text-[#00a2ff] shadow-[inset_0_0_10px_rgba(0,162,255,0.1)]" : "bg-zinc-950 border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-300"}`}
                >
                  <Mic className="w-6 h-6 mb-2" />
                  <span className="text-[11px] font-semibold">Microphone</span>
                </button>
                <button
                  onClick={() => sendCommand("photo")}
                  className={`flex flex-col items-center justify-center p-4 rounded-lg border transition-all duration-200 ${activeStream === "photo" ? "bg-[#00a2ff]/10 border-[#00a2ff] text-[#00a2ff]" : "bg-zinc-950 border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-300"}`}
                >
                  <Camera className="w-6 h-6 mb-2" />
                  <span className="text-[11px] font-semibold">Take Photo</span>
                </button>
              </div>
            </div>

            {/* Ağ / Stream Durumu */}
            <div>
              <p className="text-[10px] text-zinc-500 mb-3 uppercase tracking-widest font-bold">
                Ağ Teşhisleri
              </p>
              <div className="bg-zinc-950 rounded-lg border border-zinc-800 p-4 text-[11px] space-y-3 font-mono">
                <div className="flex justify-between items-center">
                  <span className="text-zinc-500">Sinyal Sunucusu</span>
                  <span
                    className={`flex items-center gap-1.5 ${isConnected ? "text-emerald-400" : "text-red-400"}`}
                  >
                    <div
                      className={`w-1.5 h-1.5 rounded-full ${isConnected ? "bg-emerald-400 animate-pulse" : "bg-red-400"}`}
                    />
                    {isConnected ? "Çevrimiçi" : "Çevrimdışı"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-500">Stream Durumu</span>
                  <span
                    className={
                      peerConnected
                        ? "text-[#00a2ff]"
                        : activeStream !== "none"
                          ? "text-amber-400"
                          : "text-zinc-600"
                    }
                  >
                    {peerConnected
                      ? `Aktif (${activeStream})`
                      : activeStream !== "none"
                        ? "Bekleniyor…"
                        : "Boşta"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-500">FPS</span>
                  <span
                    className={
                      frameRate > 0 ? "text-emerald-400" : "text-zinc-600"
                    }
                  >
                    {frameRate > 0 ? `${frameRate} fps` : "—"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-500">PeerJS</span>
                  <a
                    href="http://localhost:9000/peerjs"
                    target="_blank"
                    rel="noreferrer"
                    className="text-zinc-500 hover:text-[#00a2ff] transition-colors"
                  >
                    :9000
                  </a>
                </div>
              </div>
            </div>

            {/* Device Diagnostics */}
            <div>
              <p className="text-[10px] text-zinc-500 mb-3 uppercase tracking-widest font-bold">
                Device Status
              </p>
              {deviceDiags.length === 0 ? (
                <div className="bg-zinc-950 rounded-lg border border-zinc-800 p-4 text-[11px] text-zinc-600 text-center">
                  Bağlı cihaz yok
                </div>
              ) : (
                deviceDiags.map((d, i) => (
                  <div
                    key={i}
                    className="bg-zinc-950 rounded-lg border border-zinc-800 p-4 text-[11px] space-y-2.5 font-mono mb-2"
                  >
                    <div className="flex justify-between items-center">
                      <span className="text-zinc-500">Platform</span>
                      <span className="text-zinc-300 uppercase">
                        {d.platform || "—"} {d.os_version || ""}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-zinc-500">App State</span>
                      <span
                        className={
                          d.app_state === "active"
                            ? "text-emerald-400"
                            : "text-amber-400"
                        }
                      >
                        {d.app_state || "—"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-zinc-500">Stream</span>
                      <span
                        className={
                          d.stream_type ? "text-[#00a2ff]" : "text-zinc-600"
                        }
                      >
                        {d.stream_type || "idle"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-zinc-500">Last Seen</span>
                      <span className="text-zinc-400">
                        {d.last_seen ? relativeTime(d.last_seen) : "—"}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Panic Mode */}
            <div>
              <p className="text-[10px] text-zinc-500 mb-3 uppercase tracking-widest font-bold flex items-center gap-1.5">
                <ShieldAlert className="w-3 h-3 text-red-500" /> Panic Mode
              </p>
              <div className="space-y-2.5">
                <textarea
                  value={panicMessage}
                  onChange={(e) => setPanicMessage(e.target.value)}
                  placeholder="Mesaj gir (örn: Eve Dön!)"
                  rows={2}
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-red-500/50 focus:outline-none rounded-lg p-3 text-sm text-zinc-300 resize-none placeholder-zinc-600"
                />
                <button
                  onClick={() => sendAlert("alert_message", panicMessage)}
                  disabled={!panicMessage.trim() || !isConnected}
                  className="w-full bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 disabled:opacity-40 rounded-lg py-2.5 text-[11px] font-bold uppercase tracking-wider transition-all"
                >
                  Mesaj Gönder
                </button>
                <button
                  onClick={() =>
                    sendAlert("lock", "Bu cihaz geçici olarak kilitlenmiştir.")
                  }
                  disabled={!isConnected}
                  className="w-full bg-zinc-950 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200 disabled:opacity-40 rounded-lg py-2.5 text-[11px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2"
                >
                  <Lock className="w-3 h-3" /> Cihazı Kilitle
                </button>
                {alertActive && (
                  <button
                    onClick={() => sendAlert("clear", "")}
                    className="w-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 rounded-lg py-2.5 text-[11px] font-bold uppercase tracking-wider transition-all"
                  >
                    ✓ Alarmı Kaldır
                  </button>
                )}
              </div>
            </div>

            {/* Warning Note */}
            <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-[10px] text-blue-400 leading-relaxed">
              <strong className="block mb-1">ℹ️ System Note</strong>
              Remote camera and microphone activation will trigger hardware
              indicators (green/orange dots) on the target device due to iOS
              security architecture.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Timeline View ───────────────────────────────────────────────────────────

const PROFILE_ID = "default";
const API_BASE = BACKEND_URL;

function timeAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${d}d ago`;
}

const EVENT_CONFIG = {
  message: {
    icon: MessageSquare,
    color: "text-[#00a2ff]",
    bg: "bg-[#00a2ff]/10",
    label: "Message",
  },
  call: {
    icon: Phone,
    color: "text-emerald-400",
    bg: "bg-emerald-400/10",
    label: "Call",
  },
  location: {
    icon: MapPin,
    color: "text-amber-400",
    bg: "bg-amber-400/10",
    label: "Location",
  },
  risk_event: {
    icon: Shield,
    color: "text-red-400",
    bg: "bg-red-400/10",
    label: "Risk",
  },
  anomaly: {
    icon: AlertTriangle,
    color: "text-orange-400",
    bg: "bg-orange-400/10",
    label: "Anomaly",
  },
};

const RISK_BADGE = {
  high: "bg-red-500/20 text-red-400 border border-red-500/40",
  medium: "bg-amber-500/20 text-amber-400 border border-amber-500/40",
  low: "bg-yellow-500/20 text-yellow-400 border border-yellow-500/40",
};

const FILTERS = ["All", "Messages", "Calls", "Location", "Risk", "Anomalies"];
const FILTER_TYPE = {
  Messages: "message",
  Calls: "call",
  Location: "location",
  Risk: "risk_event",
  Anomalies: "anomaly",
};

export const TimelineView = () => {
  const [events, setEvents] = useState([]);
  const [filter, setFilter] = useState("All");
  const [loading, setLoading] = useState(false);
  const [anomalies, setAnomalies] = useState([]);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      try {
        const res = await apiFetch(
          `${API_BASE}/api/timeline/${PROFILE_ID}?limit=40`,
        );
        if (res.ok && alive) {
          const d = await res.json();
          setEvents(Array.isArray(d) ? d : []);
        }
      } catch {
        /* use mock */
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    const t = setInterval(load, 30000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    async function loadAnomalies() {
      try {
        const res = await apiFetch(`${API_BASE}/api/anomalies/${PROFILE_ID}`);
        if (res.ok && alive) {
          const d = await res.json();
          setAnomalies(Array.isArray(d) ? d : []);
        }
      } catch {
        /* ignore */
      }
    }
    loadAnomalies();
    const t = setInterval(loadAnomalies, 60000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const anomalyEvents = anomalies.map((a, i) => ({
    type: "anomaly",
    title: a.title,
    subtitle: a.description,
    source: "Anomaly",
    ts: a.detected_at,
    risk_level:
      a.severity === "high"
        ? "high"
        : a.severity === "medium"
          ? "medium"
          : "low",
    is_deleted: false,
    _key: `anomaly-${i}`,
  }));

  const allEvents = [...anomalyEvents, ...events];

  const visible =
    filter === "All"
      ? allEvents
      : allEvents.filter((e) => e.type === FILTER_TYPE[filter]);

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-300">
      <TopBar title="Activity Timeline" />

      {/* Anomaly banner */}
      {anomalies.length > 0 && (
        <div className="px-6 py-3 bg-orange-500/5 border-b border-orange-500/20 space-y-1.5">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-3.5 h-3.5 text-orange-400" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-orange-400">
              {anomalies.length} Anomali Tespit Edildi
            </span>
          </div>
          {anomalies.map((a, i) => (
            <div
              key={i}
              className="flex items-start gap-2 text-[12px] text-zinc-300"
            >
              <span
                className={`shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full ${
                  a.severity === "high" ? "bg-red-400" : "bg-orange-400"
                }`}
              />
              <span className="font-semibold text-zinc-200 mr-1">
                {a.title}:
              </span>
              <span className="text-zinc-400">{a.description}</span>
            </div>
          ))}
        </div>
      )}

      {/* Filter tabs */}
      <div className="px-6 pt-4 border-b border-zinc-800 flex gap-1">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-t transition-colors ${
              filter === f
                ? "text-[#00a2ff] border-b-2 border-[#00a2ff]"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {f}
          </button>
        ))}
        <div className="flex-1" />
        {loading && (
          <div className="flex items-center gap-1.5 text-[10px] text-zinc-600 pb-2">
            <div className="w-1.5 h-1.5 bg-[#00a2ff] rounded-full animate-pulse" />{" "}
            Live
          </div>
        )}
      </div>

      {/* Feed */}
      <div className="flex-1 overflow-y-auto p-6 space-y-3">
        {visible.length === 0 && (
          <div className="flex items-center justify-center h-40 text-zinc-600 text-sm">
            Bu kategoride aktivite yok.
          </div>
        )}

        {visible.map((ev, i) => {
          const cfg = EVENT_CONFIG[ev.type] || EVENT_CONFIG.risk_event;
          const Icon = cfg.icon;
          const evKey = ev._key ?? i;
          return (
            <div
              key={evKey}
              className={`flex gap-4 p-4 rounded-xl border transition-colors ${
                ev.is_deleted
                  ? "bg-red-500/5 border-red-500/20 hover:bg-red-500/10"
                  : "bg-zinc-900 border-zinc-800 hover:bg-zinc-800/70"
              }`}
            >
              {/* Type icon */}
              <div
                className={`w-10 h-10 rounded-full shrink-0 flex items-center justify-center ${cfg.bg}`}
              >
                <Icon className={`w-4 h-4 ${cfg.color}`} />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-sm font-semibold text-zinc-200">
                    {ev.title}
                  </span>

                  {ev.is_deleted && (
                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 bg-red-500/20 text-red-400 border border-red-500/40 rounded">
                      Deleted
                    </span>
                  )}
                  {ev.risk_level && ev.risk_level !== "none" && (
                    <span
                      className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${RISK_BADGE[ev.risk_level]}`}
                    >
                      {ev.risk_level}
                    </span>
                  )}
                  <span
                    className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.color}`}
                  >
                    {ev.source}
                  </span>
                </div>
                <p className="text-sm text-zinc-400 truncate">{ev.subtitle}</p>
              </div>

              {/* Timestamp */}
              <span className="text-[10px] text-zinc-600 whitespace-nowrap shrink-0 pt-1">
                {timeAgo(ev.ts)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Stats footer */}
      <div className="border-t border-zinc-800 px-6 py-3 flex gap-6 text-[11px] text-zinc-600">
        <span>
          <span className="text-zinc-400 font-semibold">
            {allEvents.filter((e) => e.risk_level !== "none").length}
          </span>{" "}
          riskli olay
        </span>
        <span>
          <span className="text-zinc-400 font-semibold">
            {anomalies.length}
          </span>{" "}
          anomali
        </span>
        <span>
          <span className="text-zinc-400 font-semibold">
            {allEvents.length}
          </span>{" "}
          toplam etkinlik
        </span>
        <div className="flex items-center gap-1.5 ml-auto">
          <Activity className="w-3 h-3" /> Son 24 saat
        </div>
      </div>
    </div>
  );
};

// ─── Contacts View ───────────────────────────────────────────────────────────
const RISK_AVATAR = {
  high: "bg-red-500/20 border-red-500/40 text-red-400",
  medium: "bg-amber-500/20 border-amber-500/40 text-amber-400",
  none: "bg-zinc-800 border-zinc-700 text-zinc-500",
};
const RISK_LABEL = {
  high: "bg-red-500/20 text-red-400 border border-red-500/40",
  medium: "bg-amber-500/20 text-amber-400 border border-amber-500/40",
  none: "bg-zinc-800 text-zinc-500 border border-zinc-700",
};
const SOURCE_BADGE = {
  sms: "bg-blue-500/20 text-blue-400",
  whatsapp: "bg-green-500/20 text-green-400",
  icloud: "bg-purple-500/20 text-purple-400",
};

export const ContactsView = () => {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState("frequency");
  const [filterRisk, setFilterRisk] = useState("all");

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const r = await apiFetch(
          `${BACKEND_URL}/api/contacts/${COMMS_PROFILE}/map?limit=60`,
        );
        const data = r.ok ? await r.json() : [];
        if (alive) {
          setContacts(data);
          setLoading(false);
        }
      } catch {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, []);

  const maxCount = contacts.reduce((m, c) => Math.max(m, c.message_count), 1);

  const sorted = [...contacts]
    .filter((c) => filterRisk === "all" || c.risk_level === filterRisk)
    .sort((a, b) => {
      if (sortBy === "frequency") return b.message_count - a.message_count;
      if (sortBy === "risk") {
        const order = { high: 0, medium: 1, none: 2 };
        return order[a.risk_level] - order[b.risk_level];
      }
      return b.last_seen.localeCompare(a.last_seen);
    });

  const highRisk = contacts.filter((c) => c.risk_level === "high").length;
  const mediumRisk = contacts.filter((c) => c.risk_level === "medium").length;

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-300">
      <TopBar title="İletişim Haritası" />

      {/* Summary bar */}
      <div className="px-6 py-3 border-b border-zinc-800 flex flex-wrap gap-4 text-[11px]">
        <span>
          <span className="text-zinc-400 font-semibold">{contacts.length}</span>{" "}
          toplam kontak
        </span>
        {highRisk > 0 && (
          <span className="text-red-400 font-semibold">
            {highRisk} yüksek riskli
          </span>
        )}
        {mediumRisk > 0 && (
          <span className="text-amber-400 font-semibold">
            {mediumRisk} orta riskli
          </span>
        )}
        <div className="flex-1" />
        {/* Sort */}
        <div className="flex gap-1">
          {["frequency", "risk", "recent"].map((s) => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                sortBy === s
                  ? "bg-[#00a2ff]/20 text-[#00a2ff]"
                  : "text-zinc-600 hover:text-zinc-400"
              }`}
            >
              {s === "frequency" ? "Sıklık" : s === "risk" ? "Risk" : "Son"}
            </button>
          ))}
        </div>
        {/* Risk filter */}
        <div className="flex gap-1">
          {["all", "high", "medium", "none"].map((r) => (
            <button
              key={r}
              onClick={() => setFilterRisk(r)}
              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                filterRisk === r
                  ? "bg-zinc-700 text-zinc-200"
                  : "text-zinc-600 hover:text-zinc-400"
              }`}
            >
              {r === "all"
                ? "Tümü"
                : r === "high"
                  ? "Yüksek"
                  : r === "medium"
                    ? "Orta"
                    : "Normal"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {loading && (
          <div className="flex items-center justify-center h-40 text-zinc-600 text-sm">
            Yükleniyor...
          </div>
        )}

        {!loading && sorted.length === 0 && (
          <div className="flex items-center justify-center h-40 text-zinc-600 text-sm">
            Henüz iletişim verisi yok.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sorted.map((c, i) => {
            const barPct = Math.round((c.message_count / maxCount) * 100);
            return (
              <div
                key={i}
                className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl p-4 transition-colors"
              >
                {/* Header */}
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className={`w-11 h-11 rounded-xl border flex items-center justify-center text-sm font-black shrink-0 ${RISK_AVATAR[c.risk_level]}`}
                  >
                    {c.name[0]?.toUpperCase() ?? "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-zinc-100 truncate">
                        {c.name}
                      </span>
                      {c.risk_level !== "none" && (
                        <span
                          className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${RISK_LABEL[c.risk_level]}`}
                        >
                          {c.risk_level}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-1 mt-0.5 flex-wrap">
                      {c.sources.map((s) => (
                        <span
                          key={s}
                          className={`text-[9px] font-bold uppercase px-1 py-0.5 rounded ${SOURCE_BADGE[s] || "bg-zinc-800 text-zinc-500"}`}
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Frequency bar */}
                <div className="mb-3">
                  <div className="flex justify-between text-[10px] text-zinc-500 mb-1">
                    <span>Mesaj sıklığı</span>
                    <span className="text-zinc-300 font-semibold">
                      {c.message_count}
                    </span>
                  </div>
                  <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        c.risk_level === "high"
                          ? "bg-red-500"
                          : c.risk_level === "medium"
                            ? "bg-amber-500"
                            : "bg-[#00a2ff]"
                      }`}
                      style={{ width: `${barPct}%` }}
                    />
                  </div>
                </div>

                {/* Stats row */}
                {(c.flagged_count > 0 || c.deleted_count > 0) && (
                  <div className="flex gap-3 text-[10px]">
                    {c.flagged_count > 0 && (
                      <span className="text-amber-400">
                        {c.flagged_count} riskli
                      </span>
                    )}
                    {c.deleted_count > 0 && (
                      <span className="text-red-400">
                        {c.deleted_count} silinen
                      </span>
                    )}
                    {c.last_seen && (
                      <span className="text-zinc-600 ml-auto">
                        {c.last_seen.slice(0, 10)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ─── Video View ──────────────────────────────────────────────────────────────
const VIDEO_EXTS = /\.(mp4|mov|avi|mkv|m4v|3gp)$/i;

export const VideoView = () => {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    apiFetch(`${BACKEND_URL}/api/drive/${COMMS_PROFILE}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((items) => {
        if (alive) {
          setVideos(
            items.filter((f) => f.type === "file" && VIDEO_EXTS.test(f.name)),
          );
          setLoading(false);
        }
      })
      .catch(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  function fmtSize(b) {
    if (!b) return "—";
    if (b > 1048576) return (b / 1048576).toFixed(1) + " MB";
    return (b / 1024).toFixed(0) + " KB";
  }

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-300">
      <TopBar title={`Cihaz Videoları (${videos.length})`} />
      <div className="p-6 flex-1 overflow-y-auto">
        {loading ? (
          <div className="text-center text-zinc-600 py-16">Yükleniyor…</div>
        ) : videos.length === 0 ? (
          <div className="text-center text-zinc-600 py-16">
            iCloud Drive'da video bulunamadı.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {videos.map((v, i) => (
              <div
                key={i}
                className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden group"
              >
                <div className="aspect-video bg-zinc-800 relative flex items-center justify-center">
                  <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-all flex items-center justify-center">
                    <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 group-hover:scale-110 transition-transform">
                      <MonitorPlay
                        className="w-5 h-5 text-white"
                        fill="white"
                      />
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
                    {v.name.split(".").pop().toUpperCase()}
                  </span>
                </div>
                <div className="p-4 flex justify-between items-center bg-zinc-900/60">
                  <div>
                    <p className="text-xs font-bold text-zinc-200 truncate max-w-[180px]">
                      {v.name}
                    </p>
                    <p className="text-[10px] text-zinc-500 mt-0.5">
                      {v.modified
                        ? new Date(v.modified).toLocaleDateString("tr-TR")
                        : "—"}{" "}
                      · {fmtSize(v.size)}
                    </p>
                  </div>
                  <Download className="w-4 h-4 text-zinc-500 hover:text-white cursor-pointer transition-colors" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Block Websites View ─────────────────────────────────────────────────────
export const BlockWebsitesView = () => {
  const [config, setConfig] = useState(null);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);

  const blocked = config?.blocked_urls ?? [];

  useEffect(() => {
    apiFetch(`${COMMS_API}/api/restrictions/${COMMS_PROFILE}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setConfig(d);
      });
  }, []);

  const save = async (updated) => {
    setSaving(true);
    try {
      await apiFetch(`${COMMS_API}/api/restrictions/${COMMS_PROFILE}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });
      setConfig(updated);
    } finally {
      setSaving(false);
    }
  };

  const addUrl = () => {
    if (!input.trim() || !config) return;
    const domain = input
      .trim()
      .replace(/^https?:\/\//, "")
      .split("/")[0];
    save({ ...config, blocked_urls: [...blocked, domain] });
    setInput("");
  };

  const removeUrl = (url) => {
    if (!config) return;
    save({ ...config, blocked_urls: blocked.filter((u) => u !== url) });
  };

  const category = (url) => {
    if (/tinder|badoo|dating/.test(url)) return "Adult/Dating";
    if (/tiktok|instagram|twitter|facebook|snap/.test(url))
      return "Social Media";
    if (/roblox|steam|minecraft/.test(url)) return "Gaming";
    return "Web";
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-300">
      <TopBar title="Web Sitesi Engelleme" />
      <div className="p-6 flex-1 overflow-y-auto">
        <div className="premium-card p-6 mb-6">
          <h3 className="text-xs font-black text-zinc-500 uppercase tracking-[0.2em] mb-4">
            Yeni Kural Ekle
          </h3>
          <div className="flex gap-4">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addUrl()}
              placeholder="URL girin (örn: facebook.com)"
              className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#00a2ff]/50 transition-all"
            />
            <button
              onClick={addUrl}
              disabled={saving || !input.trim()}
              className="bg-[#00a2ff] hover:bg-[#008de6] disabled:opacity-40 text-white px-8 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-[#00a2ff]/20"
            >
              Engelle
            </button>
          </div>
        </div>

        <div className="bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden shadow-xl">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-800/30 text-zinc-500 font-black text-[10px] uppercase tracking-widest border-b border-zinc-800">
              <tr>
                <th className="px-6 py-4">URL / Domain</th>
                <th className="px-6 py-4">Kategori</th>
                <th className="px-6 py-4 text-right">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {blocked.length === 0 ? (
                <tr>
                  <td
                    colSpan={3}
                    className="px-6 py-8 text-center text-zinc-600"
                  >
                    Engellenen site yok.
                  </td>
                </tr>
              ) : (
                blocked.map((url) => (
                  <tr
                    key={url}
                    className="hover:bg-zinc-800/20 transition-colors"
                  >
                    <td className="px-6 py-4 font-semibold text-zinc-200">
                      {url}
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full border border-zinc-700 uppercase font-bold">
                        {category(url)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => removeUrl(url)}
                        className="text-red-500 hover:text-red-400 font-bold text-[10px] uppercase tracking-widest transition-colors"
                      >
                        Kaldır
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ─── Block Applications View ─────────────────────────────────────────────────
export const BlockAppsView = () => {
  const [config, setConfig] = useState(null);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);

  const blocked = config?.block_list ?? [];

  useEffect(() => {
    apiFetch(`${COMMS_API}/api/restrictions/${COMMS_PROFILE}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setConfig(d);
      });
  }, []);

  const save = async (updated) => {
    setSaving(true);
    try {
      await apiFetch(`${COMMS_API}/api/restrictions/${COMMS_PROFILE}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });
      setConfig(updated);
    } finally {
      setSaving(false);
    }
  };

  const addApp = () => {
    if (!input.trim() || !config) return;
    save({ ...config, block_list: [...blocked, input.trim()] });
    setInput("");
  };

  const removeApp = (id) => {
    if (!config) return;
    save({ ...config, block_list: blocked.filter((a) => a !== id) });
  };

  const shortName = (id) => id.split(".").pop() || id;

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-300">
      <TopBar title="Uygulama Engelleme" />
      <div className="p-6 flex-1 overflow-y-auto space-y-6">
        <div className="premium-card p-6">
          <h3 className="text-xs font-black text-zinc-500 uppercase tracking-[0.2em] mb-4">
            Bundle ID Ekle
          </h3>
          <div className="flex gap-4">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addApp()}
              placeholder="com.burbn.instagram"
              className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#00a2ff]/50 transition-all font-mono"
            />
            <button
              onClick={addApp}
              disabled={saving || !input.trim()}
              className="bg-[#00a2ff] hover:bg-[#008de6] disabled:opacity-40 text-white px-8 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all"
            >
              Engelle
            </button>
          </div>
        </div>
        {blocked.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-zinc-600 flex-col gap-3">
            <Shield className="w-10 h-10 opacity-30" />
            <p className="text-sm">Engellenen uygulama yok.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {blocked.map((app) => (
              <div
                key={app}
                className="premium-card p-5 flex flex-col items-center text-center"
              >
                <div className="w-16 h-16 rounded-2xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-2xl font-black text-zinc-500 mb-4">
                  {shortName(app)[0]?.toUpperCase()}
                </div>
                <h3 className="font-bold text-zinc-100 mb-1 capitalize">
                  {shortName(app)}
                </h3>
                <p className="text-[10px] text-zinc-500 font-bold mb-6 tracking-tighter font-mono truncate w-full text-center">
                  {app}
                </p>
                <button
                  onClick={() => removeApp(app)}
                  className="w-full py-2.5 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white border border-red-500/20 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                >
                  Kaldır
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Block Wifi View ─────────────────────────────────────────────────────────
export const BlockWifiView = () => {
  const [config, setConfig] = useState(null);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);

  const blockedSsids = config?.blocked_ssids ?? [];

  useEffect(() => {
    apiFetch(`${COMMS_API}/api/restrictions/${COMMS_PROFILE}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setConfig(d);
      });
  }, []);

  const save = async (updated) => {
    setSaving(true);
    try {
      await apiFetch(`${COMMS_API}/api/restrictions/${COMMS_PROFILE}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });
      setConfig(updated);
    } finally {
      setSaving(false);
    }
  };

  const addSsid = () => {
    if (!input.trim() || !config) return;
    save({ ...config, blocked_ssids: [...blockedSsids, input.trim()] });
    setInput("");
  };

  const removeSsid = (ssid) => {
    if (!config) return;
    save({ ...config, blocked_ssids: blockedSsids.filter((s) => s !== ssid) });
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-300">
      <TopBar title="Wi-Fi Kısıtlamaları" />
      <div className="p-6 flex-1 overflow-y-auto space-y-6">
        <div className="premium-card p-6">
          <h3 className="text-xs font-black text-zinc-500 uppercase tracking-[0.2em] mb-4">
            Ağ Engelle
          </h3>
          <div className="flex gap-4">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addSsid()}
              placeholder="Wi-Fi adı (SSID)"
              className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#00a2ff]/50 transition-all"
            />
            <button
              onClick={addSsid}
              disabled={saving || !input.trim()}
              className="bg-[#00a2ff] hover:bg-[#008de6] disabled:opacity-40 text-white px-8 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all"
            >
              Engelle
            </button>
          </div>
        </div>
        <div className="bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden">
          <div className="p-6 border-b border-zinc-800">
            <h3 className="font-bold text-zinc-100">Engellenen Wi-Fi Ağları</h3>
            <p className="text-xs text-zinc-500 mt-1">
              Cihazın bu ağlara bağlanması kısıtlanacaktır.
            </p>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-800/30 text-zinc-500 font-black text-[10px] uppercase tracking-widest border-b border-zinc-800">
              <tr>
                <th className="px-6 py-4">SSID</th>
                <th className="px-6 py-4 text-right">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {blockedSsids.length === 0 ? (
                <tr>
                  <td
                    colSpan={2}
                    className="px-6 py-8 text-center text-zinc-600"
                  >
                    Engellenen ağ yok.
                  </td>
                </tr>
              ) : (
                blockedSsids.map((ssid) => (
                  <tr
                    key={ssid}
                    className="hover:bg-zinc-800/20 transition-colors"
                  >
                    <td className="px-6 py-4 font-mono text-zinc-200">
                      {ssid}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => removeSsid(ssid)}
                        className="text-red-500 hover:text-red-400 font-bold text-[10px] uppercase tracking-widest transition-colors"
                      >
                        Kaldır
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ─── Generic Social Monitor View ─────────────────────────────────────────────
export const SocialMonitorView = ({ networkName }) => (
  <div className="flex flex-col h-full bg-zinc-950 text-zinc-300">
    <TopBar title={`${networkName} İzleme Paneli`} />
    <div className="p-12 flex flex-col items-center justify-center text-center opacity-50 space-y-4">
      <MessageSquare className="w-16 h-16 text-[#00a2ff]" />
      <h3 className="text-xl font-bold text-zinc-100">
        {networkName} Verileri Hazırlanıyor
      </h3>
      <p className="max-w-md text-sm text-zinc-500">
        Uzak cihazdan {networkName} mesajları ve medya verileri güvenli bir
        şekilde senkronize ediliyor. Lütfen bekleyin...
      </p>
      <div className="w-64 h-1 bg-zinc-800 rounded-full overflow-hidden mt-4">
        <div className="h-full bg-[#00a2ff] animate-pulse w-2/3"></div>
      </div>
    </div>
  </div>
);

// ─── Günlük Notlar (Daily Logs) ──────────────────────────────────────────────

export const DailyLogsView = () => {
  const [logs, setLogs] = useState([]);
  const [selectedLog, setSelectedLog] = useState(null);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingContent, setLoadingContent] = useState(false);

  useEffect(() => {
    apiFetch(`${COMMS_API}/api/logs/keystrokes/${COMMS_PROFILE}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        setLogs(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const readLog = (log) => {
    setSelectedLog(log);
    setLoadingContent(true);
    apiFetch(
      `${COMMS_API}/api/logs/keystrokes/${COMMS_PROFILE}/${log.filename}`,
    )
      .then((r) => (r.ok ? r.json() : { content: "Yüklenemedi." }))
      .then((d) => {
        setContent(d.content);
        setLoadingContent(false);
      })
      .catch(() => setLoadingContent(false));
  };

  const parseLogContent = (raw) => {
    return raw
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => {
        const match = line.match(/^\[(.*?)\] \[(.*?)\] (.*)$/);
        if (match) {
          return { time: match[1], app: match[2], text: match[3] };
        }
        return { time: "?", app: "Bilinmeyen", text: line };
      });
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-300 font-sans">
      <TopBar title="Arşivlenmiş Günlük Raporlar" />
      <div className="flex flex-1 overflow-hidden p-6 gap-6">
        {/* Sol Liste: Tarihler */}
        <div className="w-1/3 bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden flex flex-col shadow-2xl">
          <div className="p-5 bg-zinc-800/30 border-b border-zinc-800 text-[10px] uppercase font-black tracking-[0.2em] text-zinc-500">
            Arşivlenmiş Kayıtlar
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
            {loading ? (
              <div className="p-8 text-center text-zinc-600 animate-pulse font-bold">
                Arşiv Taranıyor...
              </div>
            ) : logs.length === 0 ? (
              <div className="p-8 text-center text-zinc-600 font-bold">
                Henüz kayıtlı rapor yok.
              </div>
            ) : (
              logs.map((log, i) => (
                <button
                  key={i}
                  onClick={() => readLog(log)}
                  className={`w-full text-left p-4 rounded-xl transition-all flex items-center justify-between group border ${selectedLog?.filename === log.filename ? "bg-[#00a2ff] border-[#00a2ff] text-white shadow-lg" : "bg-zinc-950/30 border-zinc-800/50 hover:bg-zinc-800/50 text-zinc-400"}`}
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${selectedLog?.filename === log.filename ? "bg-white/20" : "bg-zinc-800"}`}
                    >
                      <Calendar className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-black text-sm">{log.date}</div>
                      <div
                        className={`text-[10px] uppercase tracking-widest font-bold mt-0.5 ${selectedLog?.filename === log.filename ? "text-white/70" : "text-zinc-500"}`}
                      >
                        Günlük Rapor
                      </div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Sağ Liste: İçerik Reader */}
        <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden flex flex-col shadow-2xl relative">
          {loadingContent && (
            <div className="absolute inset-0 bg-zinc-900/60 backdrop-blur-sm z-20 flex items-center justify-center">
              <div className="flex flex-col items-center gap-4">
                <RefreshCw className="w-8 h-8 text-[#00a2ff] animate-spin" />
                <span className="text-xs font-black text-[#00a2ff] uppercase tracking-widest">
                  Veriler İşleniyor
                </span>
              </div>
            </div>
          )}

          <div className="p-5 bg-zinc-800/30 border-b border-zinc-800 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-emerald-500" />
              <div>
                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">
                  Güvenli Okuma Modu
                </span>
                <span className="text-sm font-bold text-zinc-100">
                  {selectedLog
                    ? `${selectedLog.date} Raporu`
                    : "Lütfen rapor seçin"}
                </span>
              </div>
            </div>
            {selectedLog && (
              <button
                onClick={() => {
                  const blob = new Blob([content], { type: "text/plain" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = selectedLog.filename;
                  a.click();
                }}
                className="text-[9px] font-black uppercase tracking-widest bg-emerald-500/10 hover:bg-emerald-500 text-emerald-500 hover:text-white px-5 py-2.5 rounded-xl border border-emerald-500/20 transition-all shadow-xl flex items-center gap-2"
              >
                <Download className="w-3.3 h-3.5" /> İndir (.txt)
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-zinc-950/20">
            {selectedLog ? (
              <div className="max-w-4xl mx-auto space-y-3">
                {parseLogContent(content).map((entry, i) => {
                  const isRisk =
                    entry.text.toLowerCase().includes("risk") ||
                    entry.text.length > 50;
                  return (
                    <div
                      key={i}
                      className={`p-4 rounded-xl border transition-all hover:translate-x-1 ${
                        isRisk
                          ? "bg-red-500/5 border-red-500/20 text-red-200 shadow-lg shadow-red-500/5"
                          : "bg-zinc-900 border-zinc-800/50 text-zinc-400"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-tighter ${isRisk ? "bg-red-500/20 text-red-400" : "bg-zinc-800 text-zinc-500"}`}
                          >
                            {entry.app}
                          </span>
                          <span className="text-[10px] font-bold text-zinc-600">
                            {entry.time}
                          </span>
                        </div>
                        {isRisk && (
                          <ShieldAlert className="w-3.5 h-3.5 text-red-500" />
                        )}
                      </div>
                      <p
                        className={`text-sm leading-relaxed ${isRisk ? "text-zinc-100 font-medium" : "text-zinc-300"}`}
                      >
                        {entry.text}
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-zinc-600 opacity-20 select-none">
                <Lock className="w-24 h-24 mb-6" />
                <p className="text-xl font-black uppercase tracking-[0.4em]">
                  Güvenli Arşiv
                </p>
                <p className="text-[10px] mt-2 font-bold">
                  LÜTFEN SOL PANELDEKİ KAYITLARDAN BİRİNİ SEÇİN
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const SettingsView = () => {
  const [config, setConfig] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch(`${COMMS_API}/api/restrictions/${COMMS_PROFILE}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setConfig({ stealth_mode: {}, ...d });
      });
  }, []);

  const updateConfig = (newPart) => {
    const updated = { ...config, ...newPart };
    setConfig(updated);
    setSaving(true);
    apiFetch(`${COMMS_API}/api/restrictions/${COMMS_PROFILE}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    }).finally(() => setSaving(false));
  };

  if (!config)
    return (
      <div className="p-8 text-zinc-600 animate-pulse">
        Ayarlar yükleniyor...
      </div>
    );

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-300 font-sans">
      <TopBar title="Sistem & Güvenlik Ayarları" />
      <div className="p-8 max-w-4xl space-y-8 overflow-y-auto custom-scrollbar flex-1 pb-24">
        {/* Hayalet Modu (Stealth) */}
        <div className="premium-card p-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-6 opacity-5">
            <Lock className="w-32 h-32 rotate-12" />
          </div>
          <h3 className="text-xl font-black mb-6 flex items-center gap-3 text-zinc-100 uppercase tracking-tighter">
            <Shield className="w-6 h-6 text-[#00a2ff]" /> Hayalet (Gizlilik)
            Modu
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-5 bg-zinc-950/50 rounded-2xl border border-zinc-800 hover:border-[#00a2ff]/30 transition-all">
              <div>
                <p className="font-bold text-zinc-200">
                  Uygulama İkonunu Gizle
                </p>
                <p className="text-[11px] text-zinc-500 mt-1">
                  Uygulama ana ekrandan kaldırılır, sadece Uygulama
                  Kitaplığı'nda bulunur.
                </p>
              </div>
              <button
                onClick={() =>
                  updateConfig({
                    stealth_mode: {
                      ...(config.stealth_mode ?? {}),
                      hide_icon: !config.stealth_mode?.hide_icon,
                    },
                  })
                }
                className={`w-12 h-6 rounded-full relative transition-all duration-300 shadow-lg ${config.stealth_mode?.hide_icon ? "bg-[#00a2ff] shadow-[#00a2ff]/20" : "bg-zinc-800"}`}
              >
                <div
                  className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all duration-300 ${config.stealth_mode?.hide_icon ? "right-1" : "left-1"}`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between p-5 bg-zinc-950/50 rounded-2xl border border-zinc-800 hover:border-[#00a2ff]/30 transition-all">
              <div>
                <p className="font-bold text-zinc-200">Sessiz Bildirimler</p>
                <p className="text-[11px] text-zinc-500 mt-1">
                  Sistem güncellemeleri ve ajan mesajları tamamen sessizleşir.
                </p>
              </div>
              <button
                onClick={() =>
                  updateConfig({
                    stealth_mode: {
                      ...(config.stealth_mode ?? {}),
                      silent_notifications:
                        !config.stealth_mode?.silent_notifications,
                    },
                  })
                }
                className={`w-12 h-6 rounded-full relative transition-all duration-300 shadow-lg ${config.stealth_mode?.silent_notifications ? "bg-[#00a2ff] shadow-[#00a2ff]/20" : "bg-zinc-800"}`}
              >
                <div
                  className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all duration-300 ${config.stealth_mode?.silent_notifications ? "right-1" : "left-1"}`}
                />
              </button>
            </div>

            <div className="p-5 bg-zinc-950/50 rounded-2xl border border-zinc-800">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-2">
                Maskeleme İsmi (Uygulama Adı)
              </label>
              <input
                type="text"
                value={config.stealth_mode?.stealth_name ?? ""}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    stealth_mode: {
                      ...config.stealth_mode,
                      stealth_name: e.target.value,
                    },
                  })
                }
                onBlur={() =>
                  updateConfig({ stealth_mode: config.stealth_mode })
                }
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-200 focus:border-[#00a2ff] outline-none transition-all"
              />
              <p className="text-[9px] text-zinc-600 mt-2 italic font-medium">
                Uygulama, ayarlarda ve aramalarda bu isimle görünecektir.
              </p>
            </div>
          </div>
        </div>

        {/* Dijital Detoks */}
        <div className="premium-card p-8 border-emerald-500/10">
          <h3 className="text-xl font-black mb-6 flex items-center gap-3 text-zinc-100 uppercase tracking-tighter">
            <Activity className="w-6 h-6 text-emerald-500" /> Dijital Detoks
            (Kısıtlamalar)
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-5 bg-emerald-500/5 rounded-2xl border border-emerald-500/10 hover:border-emerald-500/30 transition-all">
              <div>
                <p className="font-bold text-emerald-100">Tam Detoks Modu</p>
                <p className="text-[11px] text-emerald-500/60 mt-1">
                  Aktif edildiğinde, beyaz liste dışındaki tüm uygulamalar
                  kilitlenir.
                </p>
              </div>
              <button
                onClick={() => updateConfig({ detox_mode: !config.detox_mode })}
                className={`w-12 h-6 rounded-full relative transition-all duration-300 shadow-lg ${config.detox_mode ? "bg-emerald-500 shadow-emerald-500/20" : "bg-zinc-800"}`}
              >
                <div
                  className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all duration-300 ${config.detox_mode ? "right-1" : "left-1"}`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Kayıt Durumu */}
        {saving && (
          <div className="fixed bottom-8 right-8 bg-[#00a2ff] text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest shadow-2xl animate-in slide-in-from-bottom duration-300 flex items-center gap-3">
            <RefreshCw className="w-4 h-4 animate-spin" /> Ayarlar
            Güncelleniyor...
          </div>
        )}
      </div>
    </div>
  );
};

const RISK_COLOR = {
  low: "text-yellow-400",
  medium: "text-orange-400",
  high: "text-red-400",
  critical: "text-red-600",
};

export const RiskView = () => {
  const [report, setReport] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const [rRes, eRes] = await Promise.all([
          apiFetch(`${BACKEND_URL}/api/risk/default/report`),
          apiFetch(`${BACKEND_URL}/api/risk/default/events?limit=50`),
        ]);
        if (!rRes.ok) throw new Error(`Risk raporu: HTTP ${rRes.status}`);
        if (!eRes.ok) throw new Error(`Risk olayları: HTTP ${eRes.status}`);
        const [rData, eData] = await Promise.all([rRes.json(), eRes.json()]);
        if (!alive) return;
        setReport(rData);
        setEvents(Array.isArray(eData) ? eData : (eData.events ?? []));
        setError(null);
      } catch (e) {
        if (alive) setError(e.message);
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, []);

  const score = report?.total_score ?? 0;
  const scoreColor =
    score >= 80
      ? "text-red-500"
      : score >= 50
        ? "text-orange-400"
        : score >= 20
          ? "text-yellow-400"
          : "text-emerald-400";
  const scoreBg =
    score >= 80
      ? "border-red-500/30 bg-red-500/5"
      : score >= 50
        ? "border-orange-400/30 bg-orange-400/5"
        : score >= 20
          ? "border-yellow-400/30 bg-yellow-400/5"
          : "border-emerald-400/30 bg-emerald-400/5";

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <ShieldAlert className="w-6 h-6 text-red-400" />
        <h2 className="text-lg font-black uppercase tracking-widest text-zinc-200">
          Risk Raporu
        </h2>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-zinc-500 text-sm">
          <RefreshCw className="w-4 h-4 animate-spin" /> Yükleniyor...
        </div>
      )}
      {error && (
        <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/5 text-red-400 text-sm">
          {error}
        </div>
      )}

      {report && (
        <div
          className={`p-6 rounded-2xl border ${scoreBg} flex items-center gap-6`}
        >
          <div className={`text-6xl font-black ${scoreColor}`}>{score}</div>
          <div>
            <div className="text-xs font-black uppercase tracking-widest text-zinc-500 mb-1">
              Günlük Risk Skoru
            </div>
            <div className={`text-sm font-bold ${scoreColor}`}>
              {score >= 80
                ? "KRİTİK"
                : score >= 50
                  ? "YÜKSEK"
                  : score >= 20
                    ? "ORTA"
                    : "DÜŞÜK"}
            </div>
            {report.notified && (
              <div className="text-[10px] text-zinc-600 mt-1">
                Bildirim gönderildi
              </div>
            )}
          </div>
        </div>
      )}

      {events.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-black uppercase tracking-widest text-zinc-500">
            Risk Olayları ({events.length})
          </h3>
          <div className="space-y-2">
            {events.map((ev, i) => (
              <div
                key={i}
                className="flex items-start gap-4 p-4 rounded-xl bg-zinc-900/50 border border-zinc-800"
              >
                <AlertTriangle
                  className={`w-4 h-4 mt-0.5 shrink-0 ${RISK_COLOR[ev.risk_level] ?? "text-zinc-500"}`}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-zinc-200">{ev.description}</div>
                  <div className="text-[10px] text-zinc-600 mt-1 font-mono">
                    {ev.event_type} · +{ev.score} puan
                    {ev.timestamp
                      ? ` · ${new Date(ev.timestamp).toLocaleString("tr-TR")}`
                      : ""}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && !error && events.length === 0 && (
        <div className="text-center text-zinc-600 text-sm py-12">
          Henüz risk olayı yok.
        </div>
      )}
    </div>
  );
};

// ─── Screen Time View ─────────────────────────────────────────────────────────
export const ScreenTimeView = () => {
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    apiFetch(`${BACKEND_URL}/api/screen_time/default?days=${days}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!alive) return;
        setApps(Array.isArray(data?.apps) ? data.apps : []);
        setLoading(false);
      })
      .catch(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [days]);

  const totalSec = apps.reduce((s, a) => s + a.total_seconds, 0);

  function fmtDuration(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h > 0) return `${h}s ${m}dk`;
    return `${m}dk`;
  }

  const CAT_COLOR = {
    Sosyal: "text-pink-400",
    Sistem: "text-zinc-400",
    Google: "text-blue-400",
    Uygulama: "text-amber-400",
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-300">
      <TopBar title="📱 Ekran Süresi" />
      <div className="p-6 flex-1 overflow-y-auto space-y-6">
        {/* Filtre */}
        <div className="flex items-center gap-3">
          {[1, 7, 14, 30].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${days === d ? "bg-[#00a2ff] text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"}`}
            >
              {d === 1 ? "Bugün" : `${d} Gün`}
            </button>
          ))}
          <span className="ml-auto text-xs text-zinc-600 font-mono">
            Toplam: {fmtDuration(totalSec)}
          </span>
        </div>

        {loading && (
          <div className="text-center text-zinc-600 text-sm py-16">
            Yükleniyor…
          </div>
        )}

        {!loading && apps.length === 0 && (
          <div className="text-center text-zinc-600 text-sm py-16">
            Veri bulunamadı. Yerel backup bağlı olmalıdır.
          </div>
        )}

        {!loading && apps.length > 0 && (
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-800/50 text-zinc-400 font-semibold border-b border-zinc-800">
                <tr>
                  <th className="px-5 py-3">Uygulama</th>
                  <th className="px-5 py-3">Kategori</th>
                  <th className="px-5 py-3">Süre</th>
                  <th className="px-5 py-3">Oturum</th>
                  <th className="px-5 py-3">Oran</th>
                  <th className="px-5 py-3">Son Kullanım</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {apps.map((app) => {
                  const pct =
                    totalSec > 0
                      ? Math.round((app.total_seconds / totalSec) * 100)
                      : 0;
                  return (
                    <tr
                      key={app.bundle_id}
                      className="hover:bg-zinc-800/30 transition-colors"
                    >
                      <td className="px-5 py-3">
                        <div className="font-semibold text-zinc-200">
                          {app.name}
                        </div>
                        <div className="text-[10px] text-zinc-600 font-mono">
                          {app.bundle_id}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`text-xs font-bold ${CAT_COLOR[app.category] ?? "text-zinc-400"}`}
                        >
                          {app.category}
                        </span>
                      </td>
                      <td className="px-5 py-3 font-mono text-zinc-200 font-bold">
                        {fmtDuration(app.total_seconds)}
                      </td>
                      <td className="px-5 py-3 text-zinc-400">
                        {app.sessions}
                      </td>
                      <td className="px-5 py-3 w-36">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                            <div
                              className="h-full bg-[#00a2ff] rounded-full"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-zinc-500 w-8 text-right">
                            {pct}%
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-xs text-zinc-500">
                        {app.last_used
                          ? new Date(app.last_used).toLocaleString("tr-TR")
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
