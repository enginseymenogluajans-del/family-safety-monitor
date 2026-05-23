import React, { useState, useEffect, useRef, useCallback } from "react";
import { apiFetch } from "./api";
import {
  Camera,
  Clock,
  Smartphone,
  RefreshCw,
  Trash2,
  Maximize2,
  Radio,
  RadioTower,
  MousePointerClick,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import io from "socket.io-client";
import { supabase } from "./supabaseClient";

const LiveScreenshots = ({ profileId, backendUrl }) => {
  const [screenshots, setScreenshots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [socket, setSocket] = useState(null);
  const [signalSocket, setSignalSocket] = useState(null);

  // ── Canlı Akış State ──────────────────────────────────────────────────────
  const [streaming, setStreaming] = useState(false);
  const [liveFrame, setLiveFrame] = useState(null); // base64 JPEG
  const [streamError, setStreamError] = useState(null);
  const [clickMode, setClickMode] = useState(false);
  const liveImgRef = useRef(null);

  // ── Socket.io Kurulum ─────────────────────────────────────────────────────
  useEffect(() => {
    fetchScreenshots();

    // Backend socket (port 8000) — yeni screenshot bildirimi için
    const newSocket = io(backendUrl);
    setSocket(newSocket);

    newSocket.on("new_screenshot", (data) => {
      if (data.profileId === profileId) fetchScreenshots();
    });

    // Signal server (port 8001) — komut göndermek için
    const signalUrl = backendUrl.replace(":8000", ":8001");
    const newSignalSocket = io(signalUrl, { transports: ["websocket"] });
    setSignalSocket(newSignalSocket);

    newSignalSocket.on("connect", () => {
      console.log("[LiveScreenshots] Signal server bağlandı:", signalUrl);
      newSignalSocket.emit("register", "dashboard");
    });
    newSignalSocket.on("connect_error", (err) => {
      console.error(
        "[LiveScreenshots] Signal server bağlantı hatası:",
        err.message,
      );
    });

    // Canlı kare — signal server relay'inden gelir
    newSignalSocket.on("screen_frame", (data) => {
      if (data.profileId === profileId && data.frame) {
        setLiveFrame(`data:image/jpeg;base64,${data.frame}`);
        setStreamError(null);
      }
    });

    // Ekran izni hatası — Android'den signal server üzerinden gelir
    newSignalSocket.on("screen_stream_error", (data) => {
      setStreamError(data?.error || "Ekran akışı başlatılamadı.");
      setStreaming(false);
    });

    // Supabase Realtime — live_screenshots tablosu
    const hasSupabase = !!(
      import.meta.env.VITE_SUPABASE_URL &&
      import.meta.env.VITE_SUPABASE_URL !==
        "https://your-project-id.supabase.co"
    );
    let supabaseChannel = null;
    if (hasSupabase) {
      supabaseChannel = supabase
        .channel(`live-screenshots-${profileId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "live_screenshots",
            filter: `profile_id=eq.${profileId}`,
          },
          (payload) => {
            if (payload.new) {
              const ss = payload.new;
              setScreenshots((prev) => [
                {
                  id: ss.id,
                  url: ss.image_url,
                  timestamp: ss.created_at,
                  app: "system",
                },
                ...prev,
              ]);
            }
          },
        )
        .subscribe();
    }

    return () => {
      newSignalSocket.emit("command", { type: "stop", profileId });
      newSignalSocket.close();
      newSocket.close();
      if (supabaseChannel) supabase.removeChannel(supabaseChannel);
    };
  }, [profileId]);

  // ── Anlık Ekran Görüntüsü ─────────────────────────────────────────────────
  const fetchScreenshots = async () => {
    try {
      const res = await apiFetch(`${backendUrl}/api/screenshots/${profileId}`);
      if (!res.ok) return;
      const data = await res.json();
      setScreenshots(
        Array.isArray(data)
          ? data
          : Array.isArray(data?.items)
            ? data.items
            : [],
      );
    } catch (err) {
      console.error("Screenshot fetch error:", err);
    }
  };

  const takeScreenshot = () => {
    if (!signalSocket) return;
    setLoading(true);
    signalSocket.emit("command", { type: "photo", profileId });
    setTimeout(() => setLoading(false), 2000);
  };

  // ── Supabase Realtime Broadcast — "kare hazır" sinyali ───────────────────
  useEffect(() => {
    if (!streaming) return;
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    if (!supabaseUrl || supabaseUrl === "https://your-project-id.supabase.co")
      return;

    const channel = supabase
      .channel(`screen-${profileId}`)
      .on("broadcast", { event: "frame" }, (msg) => {
        const ts = msg.payload?.ts || Date.now();
        setLiveFrame(
          `${supabaseUrl}/storage/v1/object/public/screenshots/${profileId}/live.jpg?t=${ts}`,
        );
        setStreamError(null);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [streaming, profileId]);

  // ── Canlı Akış Kontrol ────────────────────────────────────────────────────
  const startStream = () => {
    if (!signalSocket) return;
    signalSocket.emit("command", { type: "screen", profileId });
    setStreaming(true);
    setLiveFrame(null);
    setStreamError(null);
  };

  const stopStream = () => {
    if (!signalSocket) return;
    signalSocket.emit("command", { type: "stop", profileId });
    setStreaming(false);
  };

  // ── Uzaktan Tıklama ───────────────────────────────────────────────────────
  const handleLiveImageClick = useCallback(
    (e) => {
      if (!clickMode || !socket || !liveImgRef.current) return;
      const rect = liveImgRef.current.getBoundingClientRect();
      const xPercent = (e.clientX - rect.left) / rect.width;
      const yPercent = (e.clientY - rect.top) / rect.height;
      socket.emit("remote_click", {
        profileId,
        x_percent: xPercent,
        y_percent: yPercent,
      });
    },
    [clickMode, socket, profileId],
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-zinc-950 text-white">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-900/40 shrink-0">
        <div>
          <h1 className="text-sm font-black uppercase tracking-widest text-zinc-200 flex items-center gap-2">
            <Camera className="w-4 h-4 text-[#00a2ff]" /> Canlı Ekran
          </h1>
          <p className="text-zinc-600 text-[10px] mt-0.5">
            Cihaz ekranını anlık izle ve uzaktan kontrol et
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Uzaktan tıklama modu */}
          {streaming && (
            <button
              onClick={() => setClickMode((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${
                clickMode
                  ? "bg-amber-500 text-zinc-900"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
              }`}
            >
              <MousePointerClick className="w-3.5 h-3.5" />
              {clickMode ? "Tıklama AKTİF" : "Uzak Tıklama"}
            </button>
          )}

          {/* Akış başlat/durdur */}
          {streaming ? (
            <button
              onClick={stopStream}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 transition-all"
            >
              <Radio className="w-3.5 h-3.5 animate-pulse" /> Akışı Durdur
            </button>
          ) : (
            <button
              onClick={startStream}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/30 transition-all"
            >
              <RadioTower className="w-3.5 h-3.5" /> Canlı İzle
            </button>
          )}

          {/* Tek ekran görüntüsü */}
          <button
            onClick={takeScreenshot}
            disabled={loading}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${
              loading
                ? "bg-zinc-800 cursor-not-allowed text-zinc-600"
                : "bg-[#00a2ff]/20 border border-[#00a2ff]/30 text-[#00a2ff] hover:bg-[#00a2ff]/30"
            }`}
          >
            {loading ? (
              <RefreshCw className="animate-spin w-3.5 h-3.5" />
            ) : (
              <Camera className="w-3.5 h-3.5" />
            )}
            Anlık Al
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* ── Canlı Akış Paneli ── */}
        {streaming && (
          <div className="rounded-2xl border border-emerald-500/20 bg-zinc-900/50 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border-b border-emerald-500/20">
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">
                CANLI YAYIN
              </span>
              {clickMode && (
                <span className="ml-auto text-[9px] font-black text-amber-400 uppercase">
                  Ekrana tıklayarak uzaktan kontrol et
                </span>
              )}
            </div>
            <div
              className="relative flex items-center justify-center bg-zinc-950 min-h-[400px]"
              style={{ cursor: clickMode ? "crosshair" : "default" }}
            >
              {streamError ? (
                <div className="flex flex-col items-center gap-3 text-red-400 px-6 text-center">
                  <p className="text-xs font-bold">Ekran Akışı Hatası</p>
                  <p className="text-[11px] text-red-300">{streamError}</p>
                </div>
              ) : liveFrame ? (
                <img
                  ref={liveImgRef}
                  src={liveFrame}
                  alt="Live stream"
                  onClick={handleLiveImageClick}
                  className="max-h-[70vh] w-auto object-contain select-none"
                  draggable={false}
                />
              ) : (
                <div className="flex flex-col items-center gap-3 text-zinc-600">
                  <RefreshCw className="w-8 h-8 animate-spin" />
                  <p className="text-xs">Cihazdan kare bekleniyor…</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Kayıtlı Ekran Görüntüleri Galerisi ── */}
        <div>
          <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest mb-4">
            Kaydedilen Görüntüler
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <AnimatePresence>
              {screenshots.map((ss, index) => (
                <motion.div
                  key={ss.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ delay: Math.min(index * 0.05, 0.3) }}
                  className="group bg-zinc-900 rounded-xl overflow-hidden border border-zinc-800 hover:border-[#00a2ff]/40 transition-all shadow-xl"
                >
                  <div
                    className="relative bg-black/40"
                    style={{ aspectRatio: "9/16" }}
                  >
                    <img
                      src={
                        ss.url?.startsWith("data:")
                          ? ss.url
                          : `${backendUrl}${ss.url}`
                      }
                      alt="Screenshot"
                      className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                      <div className="flex gap-2 w-full">
                        <button className="flex-1 bg-white/10 hover:bg-white/20 backdrop-blur-md p-2 rounded-lg transition-colors">
                          <Maximize2 className="w-4 h-4 mx-auto" />
                        </button>
                        <button className="bg-red-500/20 hover:bg-red-500/40 text-red-400 p-2 rounded-lg transition-colors border border-red-500/20">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="p-3 border-t border-zinc-800">
                    <div className="flex items-center gap-2">
                      <Smartphone className="w-3.5 h-3.5 text-[#00a2ff]" />
                      <span className="text-[10px] text-zinc-400 capitalize">
                        {ss.app}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 text-[9px] text-zinc-600 font-mono">
                      <Clock className="w-3 h-3" />
                      {typeof ss.timestamp === "string"
                        ? ss.timestamp.replace("T", " ").slice(0, 16)
                        : ss.timestamp}
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {screenshots.length === 0 && !streaming && (
              <div className="col-span-full py-16 text-center border-2 border-dashed border-zinc-800 rounded-2xl">
                <Camera className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
                <p className="text-zinc-600 text-sm">
                  Henüz görüntü yok. "Canlı İzle" veya "Anlık Al" ile başlayın.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LiveScreenshots;
