const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const axios = require("axios");

// ── Supabase config ───────────────────────────────────────────────────────────
const SUPABASE_URL =
  process.env.SUPABASE_URL || "https://vgmybtiqrpboieipqdzy.supabase.co";
const SUPABASE_KEY =
  process.env.SUPABASE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZnbXlidGlxcnBib2llaXBxZHp5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTE2ODAzMSwiZXhwIjoyMDk0NzQ0MDMxfQ.Cok3VBhBWeu8gutPN1k4nt4SlpheLf0JbB5GKQIX9mE";

async function uploadSnapshotToSupabase(profileId, base64Data) {
  try {
    // base64 → Buffer
    const b64 = base64Data.replace(/^data:image\/\w+;base64,/, "");
    const buf = Buffer.from(b64, "base64");
    const filename = `${profileId}_${Date.now()}.jpg`;
    const objectPath = `${profileId}/${filename}`;

    // Storage'a yükle
    await axios.post(
      `${SUPABASE_URL}/storage/v1/object/screenshots/${objectPath}`,
      buf,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "image/jpeg",
          "x-upsert": "true",
        },
      },
    );

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/screenshots/${objectPath}`;

    // live_screenshots tablosuna kaydet
    await axios.post(
      `${SUPABASE_URL}/rest/v1/live_screenshots`,
      { profile_id: profileId, image_url: publicUrl },
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
        },
      },
    );

    return publicUrl;
  } catch (e) {
    console.error("Supabase upload hatası:", e.message);
    return null;
  }
}

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  transports: ["websocket"],
  pingTimeout: 60000,
  pingInterval: 25000,
  upgradeTimeout: 30000,
  allowUpgrades: false,
});

// ── Diagnostics store — en son cihaz durumu (socketId → payload) ──────────
const _diagnostics = new Map();

io.on("connection", (socket) => {
  console.log("🔗 Bağlandı:", socket.id);

  // Rol kaydı: 'dashboard' veya 'device'
  socket.on("register", (role) => {
    socket.join(role);
    console.log(`📋 ${socket.id} → rol: ${role}`);
    // Dashboard bağlandığında cihazlara bildir
    if (role === "dashboard") {
      socket.broadcast.emit("dashboard-connected", { id: socket.id });
    }
  });

  socket.on("diagnostics", (data) => {
    _diagnostics.set(socket.id, {
      ...data,
      last_seen: Date.now(),
      socket_id: socket.id,
    });
  });

  socket.on("disconnect", (reason) => {
    console.log("❌ Ayrıldı:", socket.id, "| Sebep:", reason);
    _diagnostics.delete(socket.id);
  });

  // WebRTC Sinyalleşme — offer/answer/ice peer ID'ye yönlendirilir
  socket.on("offer", (payload) => {
    io.to(payload.target).emit("offer", payload);
  });

  socket.on("answer", (payload) => {
    io.to(payload.target).emit("answer", payload);
  });

  socket.on("ice-candidate", (incoming) => {
    io.to(incoming.target).emit("ice-candidate", incoming);
  });

  // Komut iletimi (kamera/ekran/ses başlat)
  socket.on("command", (data) => {
    console.log("📡 Komut:", data.type, "→ from:", data.from);
    socket.broadcast.emit("command", data);
  });

  // Fotoğraf snapshot — cihazdan dashboard'a ilet + Supabase'e kaydet
  socket.on("snapshot", async (payload) => {
    const target = payload.target;
    if (target) {
      io.to(target).emit("snapshot", payload);
    } else {
      io.to("dashboard").emit("snapshot", payload);
    }
    // Arka planda Supabase'e yükle
    if (payload.data && payload.profileId) {
      const url = await uploadSnapshotToSupabase(
        payload.profileId,
        payload.data,
      );
      if (url) console.log("📸 Snapshot Supabase'e kaydedildi:", url);
    }
  });

  // Ekran akışı karesi — cihazdan dashboard'a ilet (base64 JPEG)
  // Her 10. kareyi Supabase'e kaydet (bant genişliği tasarrufu)
  let _frameCount = 0;
  socket.on("screen_frame", async (payload) => {
    io.to("dashboard").emit("screen_frame", payload);
    _frameCount++;
    if (_frameCount % 10 === 0 && payload.frame && payload.profileId) {
      const url = await uploadSnapshotToSupabase(
        payload.profileId,
        `data:image/jpeg;base64,${payload.frame}`,
      );
      if (url) console.log("🖥️ Ekran karesi Supabase'e kaydedildi");
    }
  });

  // Uzaktan müdahale alarmı — tam ekran uyarı / kilit
  socket.on("alert", (data) => {
    console.log(`🚨 Alert [${data.type}]: "${data.message || ""}"`);
    socket.broadcast.emit("alert", data);
  });

  // Cihaz kayıt (nesne formatı — Android gönderir)
  socket.on("device-register", (data) => {
    socket.join("device");
    const info = typeof data === "object" ? data : { profileId: data };
    _diagnostics.set(socket.id, {
      ...info,
      last_seen: Date.now(),
      socket_id: socket.id,
      platform: info.platform || "android",
      app_state: "active",
    });
    console.log(`📱 Cihaz kaydı: ${info.profileId || socket.id}`);
  });
});

// Advanced Modules
const gps = require("./advanced-modules/gps");
const mdm = require("./advanced-modules/mdm");
const icloud = require("./advanced-modules/icloud");
const network = require("./advanced-modules/network");

gps.init(app, io);
mdm.init(app, io);
icloud.init(app, io);
network.init(app, io);

// Diagnostics REST — tüm bağlı cihazların son durumu
app.get("/api/diagnostics", (_req, res) => {
  res.json([..._diagnostics.values()]);
});

// Profile bazlı diagnostics (frontend DIAG_BASE/api/diagnostics/:id için)
app.get("/api/diagnostics/:profile_id", (req, res) => {
  const list = [..._diagnostics.values()].filter(
    (d) =>
      !req.params.profile_id ||
      d.profileId === req.params.profile_id ||
      req.params.profile_id === "default",
  );
  res.json(list);
});

// Panic REST endpoint — otomasyon / Python backend tarafından çağrılabilir
app.post("/api/panic", (req, res) => {
  const { type = "alert_message", message = "Dikkat!" } = req.body;
  io.emit("alert", { type, message });
  console.log(`🚨 Panic API: [${type}] "${message}"`);
  res.json({ sent: true, type, message });
});

const PORT = process.env.WEBRTC_PORT || 8001;
server.listen(PORT, () =>
  console.log(
    `🚀 Sinyal Sunucusu (WebRTC) ${PORT} portunda başarıyla çalışıyor.`,
  ),
);
