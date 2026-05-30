import { useState, useEffect, useRef, useCallback } from "react";
import { apiFetch, BACKEND_URL } from "./api";
import {
  MoreVertical,
  ShieldAlert,
  Trash2,
  User,
  MessageSquare,
  RefreshCw,
  WifiOff,
  QrCode,
  CheckCircle2,
  X,
  Wifi,
} from "lucide-react";

// WA mesajları backend proxy üzerinden çekilir (CORS & ağ sorunlarını önler)
const WA_API = BACKEND_URL;

function fmtTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  if (isNaN(d)) return "";
  return d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

function fmtDate(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  if (isNaN(d)) return "";
  return d.toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

const RISK_LABEL = {
  low: "Düşük Risk",
  medium: "Orta Risk",
  high: "Yüksek Risk",
  critical: "Kritik",
};

export default function WhatsAppMonitor() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeChat, setActiveChat] = useState(null);
  const bottomRef = useRef(null);

  // ── 3-nokta menü ──────────────────────────────────────────────────────────
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // ── QR Modal ──────────────────────────────────────────────────────────────
  const [qrModal, setQrModal] = useState(false);
  const [qrData, setQrData] = useState(null); // base64 data URL
  const [qrConnected, setQrConnected] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrAgentDown, setQrAgentDown] = useState(false);

  // ── Mesaj yükleme ─────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`${WA_API}/api/wa/messages?limit=300`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMessages(data);
      setError(null);
      setActiveChat((prev) => {
        if (prev) return prev;
        return data[0]?.chat_name ?? null;
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const wrappedLoad = async () => {
      if (!alive) return;
      await load();
    };
    wrappedLoad();
    const t = setInterval(wrappedLoad, 15000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeChat, messages.length]);

  // ── Menü dışı tıklayınca kapat ────────────────────────────────────────────
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  // ── QR kodu çek ───────────────────────────────────────────────────────────
  const fetchQR = useCallback(async () => {
    setQrLoading(true);
    try {
      const r = await apiFetch(`${WA_API}/api/whatsapp/qr`);
      const d = await r.json();
      setQrAgentDown(!!d.error);
      setQrConnected(!!d.connected);
      setQrData(d.qr_base64 || null);
    } catch {
      setQrAgentDown(true);
      setQrConnected(false);
      setQrData(null);
    } finally {
      setQrLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!qrModal) return;
    fetchQR();
    const id = setInterval(fetchQR, 30000);
    return () => clearInterval(id);
  }, [qrModal, fetchQR]);

  // ── Chat verileri ─────────────────────────────────────────────────────────
  const chats = Object.values(
    messages.reduce((acc, m) => {
      if (
        !acc[m.chat_name] ||
        new Date(m.timestamp) > new Date(acc[m.chat_name].timestamp)
      ) {
        acc[m.chat_name] = m;
      }
      return acc;
    }, {}),
  ).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  const chatMessages = messages
    .filter((m) => m.chat_name === activeChat)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  const hasRisk = (chatName) =>
    messages.some(
      (m) =>
        m.chat_name === chatName && (m.risk_level !== "none" || m.is_deleted),
    );

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-300">
      {/* Header */}
      <div className="h-16 border-b border-zinc-800 flex items-center justify-between px-6 bg-zinc-900/30 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-emerald-500" />
          </div>
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest text-zinc-200">
              WhatsApp Takibi
            </h2>
            <div className="flex items-center gap-1.5 mt-0.5">
              {error ? (
                <>
                  <WifiOff className="w-3 h-3 text-red-400" />
                  <span className="text-[10px] font-bold text-red-400 uppercase tracking-tighter">
                    Agent çevrimdışı — QR ile bağlan
                  </span>
                </>
              ) : (
                <>
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-tighter">
                    Canlı bağlantı aktif
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {loading && (
            <RefreshCw className="w-4 h-4 text-zinc-500 animate-spin" />
          )}
          <button className="p-2 hover:bg-zinc-800 rounded-lg transition-colors">
            <ShieldAlert className="w-4 h-4 text-zinc-500" />
          </button>

          {/* 3-nokta menü */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className={`p-2 rounded-lg transition-colors ${menuOpen ? "bg-zinc-700" : "hover:bg-zinc-800"}`}
            >
              <MoreVertical className="w-4 h-4 text-zinc-400" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-52 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl z-50 overflow-hidden">
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    setQrModal(true);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-zinc-200 hover:bg-zinc-800 transition-colors"
                >
                  <QrCode className="w-4 h-4 text-emerald-400" />
                  QR ile Bağlan
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    load();
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-zinc-200 hover:bg-zinc-800 transition-colors"
                >
                  <RefreshCw className="w-4 h-4 text-zinc-400" />
                  Mesajları Yenile
                </button>
                <div className="h-px bg-zinc-800 mx-3" />
                <button
                  onClick={() => setMenuOpen(false)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-zinc-600 hover:bg-zinc-800 transition-colors"
                >
                  <Wifi className="w-4 h-4 text-zinc-600" />
                  Bağlantı Durumu
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── QR Modal ── */}
      {qrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* overlay */}
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setQrModal(false)}
          />
          <div className="relative z-10 bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl w-[360px] p-6">
            {/* Kapat */}
            <button
              onClick={() => setQrModal(false)}
              className="absolute top-4 right-4 p-1.5 hover:bg-zinc-800 rounded-lg transition-colors"
            >
              <X className="w-4 h-4 text-zinc-500" />
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <QrCode className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-sm font-black text-zinc-100 uppercase tracking-widest">
                  WhatsApp Bağlantısı
                </h3>
                <p className="text-[10px] text-zinc-500 mt-0.5">
                  QR kodu tarayarak canlı mesaj takibini başlatın
                </p>
              </div>
            </div>

            <div className="flex flex-col items-center">
              {/* Bağlı */}
              {qrConnected && (
                <div className="flex flex-col items-center gap-3 py-8">
                  <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                    <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                  </div>
                  <p className="text-emerald-400 font-black text-sm uppercase tracking-widest">
                    WhatsApp Bağlı
                  </p>
                  <p className="text-zinc-500 text-xs text-center">
                    Mesajlar aktif olarak izleniyor.
                  </p>
                </div>
              )}

              {/* Agent çevrimdışı */}
              {!qrConnected && qrAgentDown && (
                <div className="flex flex-col items-center gap-3 py-6">
                  <WifiOff className="w-10 h-10 text-red-400/50" />
                  <p className="text-red-400 font-bold text-xs text-center">
                    WhatsApp Agent çalışmıyor
                  </p>
                  <code className="text-[10px] bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-300 font-mono">
                    cd whatsapp-agent && node index.js
                  </code>
                </div>
              )}

              {/* QR kodu */}
              {!qrConnected && !qrAgentDown && qrData && (
                <>
                  <div className="bg-white p-3 rounded-xl shadow-lg mb-4">
                    <img
                      src={qrData}
                      alt="WhatsApp QR Kodu"
                      className="w-52 h-52 block"
                    />
                  </div>
                  <p className="text-zinc-200 font-bold text-sm">
                    QR Kodu Tarayın
                  </p>
                  <p className="text-zinc-500 text-xs mt-1 text-center">
                    WhatsApp → Bağlı Cihazlar → Cihaz Ekle
                  </p>
                </>
              )}

              {/* Yükleniyor */}
              {!qrConnected && !qrAgentDown && !qrData && (
                <div className="flex flex-col items-center gap-3 py-8">
                  <RefreshCw className="w-8 h-8 text-zinc-500 animate-spin" />
                  <p className="text-zinc-500 text-xs">
                    {qrLoading ? "QR Kodu Oluşturuluyor…" : "Agent bekleniyor…"}
                  </p>
                </div>
              )}
            </div>

            <button
              onClick={fetchQR}
              className="mt-5 w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold transition-colors"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${qrLoading ? "animate-spin" : ""}`}
              />
              Yenile
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Sol: Sohbet listesi */}
        <div className="w-[320px] border-r border-zinc-800 bg-zinc-900/30 overflow-y-auto custom-scrollbar">
          {loading && chats.length === 0 && (
            <div className="flex items-center justify-center h-32 text-zinc-600 text-xs">
              Yükleniyor...
            </div>
          )}
          {error && chats.length === 0 && (
            <div className="p-4 text-center">
              <WifiOff className="w-6 h-6 mx-auto mb-2 text-red-400/50" />
              <p className="text-red-400 text-xs mb-3">
                WhatsApp agent çevrimdışı veya mesaj yok
              </p>
              <button
                onClick={() => setQrModal(true)}
                className="flex items-center gap-2 mx-auto px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-[10px] font-black uppercase hover:bg-emerald-500/20 transition-colors"
              >
                <QrCode className="w-3.5 h-3.5" />
                QR ile Bağlan
              </button>
            </div>
          )}
          {chats.map((c) => (
            <div
              key={c.chat_name}
              onClick={() => setActiveChat(c.chat_name)}
              className={`p-5 border-b border-zinc-800/50 cursor-pointer transition-all duration-200 relative group ${
                activeChat === c.chat_name
                  ? "bg-[#00a2ff]/10 border-l-4 border-l-[#00a2ff]"
                  : "hover:bg-zinc-800/40"
              }`}
            >
              <div className="flex items-start gap-4">
                <div className="relative">
                  <div className="w-11 h-11 rounded-2xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-sm font-black text-zinc-500 group-hover:text-zinc-300 transition-colors">
                    {c.chat_name?.[0]?.toUpperCase() ?? "?"}
                  </div>
                  {hasRisk(c.chat_name) && (
                    <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-red-500 border-2 border-zinc-900" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-1">
                    <span
                      className={`font-bold text-sm truncate ${activeChat === c.chat_name ? "text-[#00a2ff]" : "text-zinc-200"}`}
                    >
                      {c.chat_name}
                    </span>
                    <span className="text-[10px] font-bold text-zinc-600 shrink-0 ml-2">
                      {fmtTime(c.timestamp)}
                    </span>
                  </div>
                  <p className="text-[11px] truncate text-zinc-500">
                    {c.is_deleted
                      ? "🗑 Mesaj silindi"
                      : c.text || (c.has_media ? "[Medya]" : "—")}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Sağ: Mesajlar */}
        <div className="flex-1 bg-zinc-950 overflow-y-auto p-6 space-y-4 custom-scrollbar">
          {!activeChat && !loading && (
            <div className="flex items-center justify-center h-full text-zinc-600 text-sm">
              Bir sohbet seçin
            </div>
          )}

          {chatMessages.map((msg, i) => {
            const prevMsg = chatMessages[i - 1];
            const showDate =
              !prevMsg || fmtDate(msg.timestamp) !== fmtDate(prevMsg.timestamp);

            return (
              <div key={`${msg.timestamp}-${i}`}>
                {showDate && (
                  <div className="flex justify-center my-2">
                    <span className="px-4 py-1 rounded-full bg-zinc-900/50 border border-zinc-800 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em]">
                      {fmtDate(msg.timestamp)}
                    </span>
                  </div>
                )}

                {/* Silinen mesaj */}
                {msg.is_deleted && (
                  <div className="flex gap-4">
                    <div className="w-9 h-9 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
                      <User className="w-4 h-4 text-zinc-500" />
                    </div>
                    <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-4 max-w-md relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-2 bg-red-500/10 rounded-bl-xl border-b border-l border-red-500/20">
                        <Trash2 className="w-3 h-3 text-red-500 animate-pulse" />
                      </div>
                      <div className="font-black text-xs text-red-500 uppercase tracking-widest mb-1 flex items-center gap-2">
                        <ShieldAlert className="w-3 h-3" /> SİLİNEN MESAJ —{" "}
                        {msg.chat_name || msg.sender?.split("@")[0] || "?"}
                      </div>
                      <div className="text-zinc-200 text-sm italic opacity-80">
                        {msg.text || "[Silinen mesaj]"}
                      </div>
                      <div className="text-[10px] text-zinc-600 text-right mt-2 font-mono">
                        {fmtTime(msg.timestamp)}
                      </div>
                    </div>
                  </div>
                )}

                {/* Gelen mesaj */}
                {!msg.is_deleted && !msg.is_from_me && (
                  <div className="flex gap-4">
                    <div className="w-9 h-9 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
                      <User className="w-4 h-4 text-zinc-500" />
                    </div>
                    <div
                      className={`p-4 rounded-2xl rounded-tl-none max-w-md ${
                        msg.risk_level !== "none"
                          ? "bg-amber-500/10 border border-amber-500/30"
                          : "bg-zinc-800/60 border border-zinc-700/40"
                      }`}
                    >
                      <div className="font-black text-xs text-[#00a2ff] uppercase tracking-widest mb-1">
                        {msg.chat_name ||
                          msg.sender?.split("@")[0] ||
                          msg.sender}
                      </div>
                      {msg.risk_level !== "none" && (
                        <div className="text-[9px] font-black text-amber-400 uppercase tracking-widest mb-1">
                          ⚠ {RISK_LABEL[msg.risk_level] ?? msg.risk_level}
                        </div>
                      )}
                      <div className="text-zinc-200 text-sm leading-relaxed">
                        {msg.is_redacted ? (
                          <span className="text-zinc-500 italic">
                            [Finansal veri gizlendi]
                          </span>
                        ) : (
                          msg.text || (msg.has_media ? "[Medya]" : "—")
                        )}
                      </div>
                      <div className="text-[10px] text-zinc-600 text-right mt-2 font-mono">
                        {fmtTime(msg.timestamp)}
                      </div>
                    </div>
                  </div>
                )}

                {/* Gönderilen mesaj */}
                {!msg.is_deleted && msg.is_from_me && (
                  <div className="flex gap-4 justify-end">
                    <div className="bg-[#00a2ff] text-white rounded-2xl rounded-tr-none p-4 max-w-md shadow-lg shadow-[#00a2ff]/10">
                      <div className="text-sm leading-relaxed">
                        {msg.text || (msg.has_media ? "[Medya]" : "—")}
                      </div>
                      <div className="text-[10px] text-white/60 text-right mt-2 font-mono">
                        {fmtTime(msg.timestamp)}
                      </div>
                    </div>
                    <div className="w-9 h-9 rounded-xl bg-[#00a2ff]/10 border border-[#00a2ff]/30 flex items-center justify-center shrink-0">
                      <User className="w-4 h-4 text-[#00a2ff]" />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}
