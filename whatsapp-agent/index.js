"use strict";

require("dotenv").config();

const qrcode = require("qrcode-terminal");
const express = require("express");
const cors = require("cors");

const { initDb } = require("./src/db");
const { createClient } = require("./src/waClient");
const { handleMessage } = require("./src/messageHandler");
const { handleRevoke } = require("./src/revokeHandler");
const apiRouter = require("./src/api");
const state = require("./src/state");

const PROFILE_ID = process.env.PROFILE_ID || "default";
const PORT = parseInt(process.env.PORT) || 3001;

// Yeniden bağlanma denemesi sayacı
let restartCount = 0;
const MAX_RESTARTS = 5;

async function startWhatsApp() {
  if (restartCount >= MAX_RESTARTS) {
    console.error(
      `[WA] ${MAX_RESTARTS} başarısız denemeden sonra yeniden başlatma durduruldu.`,
    );
    console.error(
      "[WA] .wwebjs_auth/ ve .wwebjs_cache/ klasörlerini silerek tekrar deneyin.",
    );
    return;
  }

  restartCount++;
  console.log(`[WA] Başlatılıyor… (deneme ${restartCount}/${MAX_RESTARTS})`);

  const client = createClient();

  client.on("qr", (qr) => {
    console.log(
      "\n[WA] QR kodu tarayın (WhatsApp → Bağlı Cihazlar → Cihaz Ekle):\n",
    );
    qrcode.generate(qr, { small: true });
    state.latestQr = qr;
    state.isConnected = false;
  });

  client.on("ready", () => {
    console.log(`[WA] Bağlantı kuruldu. Profil: ${PROFILE_ID}`);
    state.isConnected = true;
    state.latestQr = null;
    restartCount = 0; // Başarılı bağlantıda sayacı sıfırla
  });

  client.on("auth_failure", (msg) => {
    console.error("[WA] Kimlik doğrulama hatası:", msg);
    state.isConnected = false;
    // Auth hatasında oturumu temizleyip yeniden başlat
    setTimeout(() => startWhatsApp(), 5000);
  });

  client.on("disconnected", (reason) => {
    console.warn("[WA] Bağlantı kesildi:", reason);
    state.isConnected = false;
    state.latestQr = null;
    // Kısa gecikme sonrası yeniden bağlan
    setTimeout(() => startWhatsApp(), 8000);
  });

  // Gelen mesajlar
  client.on("message", handleMessage);

  // Gönderilen mesajlar (bağlı cihazlardan)
  client.on("message_create", (msg) => {
    if (msg.fromMe) handleMessage(msg);
  });

  // Silinen mesajlar
  client.on("message_revoke_everyone", handleRevoke);

  // Puppeteer / context hataları (örn. "Execution context was destroyed")
  client.on("change_state", (s) => {
    console.log("[WA] Durum değişti:", s);
  });

  try {
    await client.initialize();
  } catch (err) {
    console.error("[WA] initialize() hatası:", err.message);
    state.isConnected = false;
    console.log(`[WA] ${8}s sonra yeniden deneniyor…`);
    setTimeout(() => startWhatsApp(), 8000);
  }
}

async function main() {
  // ── DB ───────────────────────────────────────────────────────────────────
  await initDb();

  // ── Express API (WhatsApp bağlantısından bağımsız çalışır) ───────────────
  const app = express();
  app.use(cors());
  app.use(apiRouter);

  app.listen(PORT, () => {
    console.log(
      `[API] http://localhost:${PORT}/api/messages  (profil: ${PROFILE_ID})`,
    );
  });

  // ── WhatsApp client ──────────────────────────────────────────────────────
  await startWhatsApp();
}

main().catch((err) => {
  console.error("[Startup] Fatal:", err.message);
  process.exit(1);
});
