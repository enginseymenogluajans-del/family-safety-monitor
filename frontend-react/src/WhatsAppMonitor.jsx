import { useState, useEffect, useRef } from "react";
import { apiFetch } from "./api";
import {
  MoreVertical,
  ShieldAlert,
  Trash2,
  User,
  MessageSquare,
  RefreshCw,
  WifiOff,
} from "lucide-react";

const WA_API = import.meta.env.VITE_WA_URL || "http://localhost:3001";

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

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await apiFetch(`${WA_API}/api/messages?limit=300`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!alive) return;
        setMessages(data);
        setError(null);
        setActiveChat((prev) => {
          if (prev) return prev;
          const first = data[0]?.chat_name ?? null;
          return first;
        });
      } catch (e) {
        if (alive) setError(e.message);
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    const t = setInterval(load, 15000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeChat, messages.length]);

  // Unique chats: last message per chat, sorted by timestamp desc
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
                    İzleme sunucusuna bağlanılamıyor
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
          <button className="p-2 hover:bg-zinc-800 rounded-lg transition-colors">
            <MoreVertical className="w-4 h-4 text-zinc-500" />
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sol: Sohbet listesi */}
        <div className="w-[320px] border-r border-zinc-800 bg-zinc-900/30 overflow-y-auto custom-scrollbar">
          {loading && chats.length === 0 && (
            <div className="flex items-center justify-center h-32 text-zinc-600 text-xs">
              Yükleniyor...
            </div>
          )}
          {error && chats.length === 0 && (
            <div className="p-4 text-red-400 text-xs text-center">
              <WifiOff className="w-6 h-6 mx-auto mb-2 opacity-50" />
              localhost:3001 erişilemiyor
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
                        <ShieldAlert className="w-3 h-3" /> SİLİNEN MESAJ
                        YAKALANDI
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
                        {msg.sender}
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
