import React, { useState, useEffect } from "react";
import { apiFetch } from "./api";
import {
  Camera,
  Clock,
  Smartphone,
  RefreshCw,
  Trash2,
  Maximize2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import io from "socket.io-client";

const LiveScreenshots = ({ profileId, backendUrl }) => {
  const [screenshots, setScreenshots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    fetchScreenshots();

    // Socket.io bağlantısı
    const newSocket = io(backendUrl);
    setSocket(newSocket);

    newSocket.on("new_screenshot", (data) => {
      if (data.profileId === profileId) {
        fetchScreenshots();
      }
    });

    return () => newSocket.close();
  }, [profileId]);

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

  const takeScreenshot = async () => {
    setLoading(true);
    try {
      await apiFetch(`${backendUrl}/api/screenshots/take/${profileId}`, {
        method: "POST",
      });
      // Komut gönderildi, socket üzerinden gelmesini bekleyeceğiz
      setTimeout(() => setLoading(false), 2000);
    } catch (err) {
      console.error("Command error:", err);
      setLoading(false);
    }
  };

  return (
    <div className="p-6 bg-gray-900 min-h-screen text-white">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
            Live Screenshots
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Cihaz ekranını anlık olarak izleyin ve kaydedin.
          </p>
        </div>
        <button
          onClick={takeScreenshot}
          disabled={loading}
          className={`flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all ${
            loading
              ? "bg-gray-700 cursor-not-allowed"
              : "bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-900/20 active:scale-95"
          }`}
        >
          {loading ? (
            <RefreshCw className="animate-spin w-5 h-5" />
          ) : (
            <Camera className="w-5 h-5" />
          )}
          TAKE SCREENSHOT
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <AnimatePresence>
          {screenshots.map((ss, index) => (
            <motion.div
              key={ss.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ delay: index * 0.1 }}
              className="group bg-gray-800 rounded-2xl overflow-hidden border border-gray-700/50 hover:border-blue-500/50 transition-all shadow-xl"
            >
              <div className="relative aspect-[9/16] bg-black/40">
                <img
                  src={`${backendUrl}${ss.url}`}
                  alt="Screenshot"
                  className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                  <div className="flex gap-2 w-full">
                    <button className="flex-1 bg-white/10 hover:bg-white/20 backdrop-blur-md p-2 rounded-lg transition-colors">
                      <Maximize2 className="w-5 h-5 mx-auto" />
                    </button>
                    <button className="bg-red-500/20 hover:bg-red-500/40 text-red-400 p-2 rounded-lg transition-colors border border-red-500/20">
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
              <div className="p-4 bg-gray-800/50 backdrop-blur-sm border-t border-gray-700/30">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    {ss.app === "whatsapp" ? (
                      <img
                        src="https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg"
                        className="w-5 h-5"
                        alt="WA"
                      />
                    ) : (
                      <Smartphone className="w-4 h-4 text-blue-400" />
                    )}
                  </div>
                  <span className="font-medium text-gray-200 capitalize">
                    {ss.app}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Clock className="w-3 h-3" />
                  {ss.timestamp}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {screenshots.length === 0 && !loading && (
          <div className="col-span-full py-20 text-center border-2 border-dashed border-gray-700 rounded-3xl">
            <Camera className="w-16 h-16 text-gray-600 mx-auto mb-4 opacity-20" />
            <p className="text-gray-500">
              Henüz ekran görüntüsü yok. Başlatmak için butona basın.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default LiveScreenshots;
