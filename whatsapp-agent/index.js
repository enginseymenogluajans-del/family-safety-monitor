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

async function main() {
  // ── DB ───────────────────────────────────────────────────────────────────
  await initDb();

  // ── WhatsApp client ──────────────────────────────────────────────────────
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
  });

  client.on("auth_failure", (msg) => {
    console.error("[WA] Kimlik doğrulama hatası:", msg);
    state.isConnected = false;
  });

  client.on("disconnected", (reason) => {
    console.warn("[WA] Bağlantı kesildi:", reason);
    state.isConnected = false;
  });

  // Gelen mesajlar
  client.on("message", handleMessage);

  // Gönderilen mesajlar (bağlı cihazlardan)
  client.on("message_create", (msg) => {
    if (msg.fromMe) handleMessage(msg);
  });

  // Silinen mesajlar
  client.on("message_revoke_everyone", handleRevoke);

  client.initialize();

  // ── Express API ──────────────────────────────────────────────────────────
  const app = express();
  app.use(cors());
  app.use(apiRouter);

  app.listen(PORT, () => {
    console.log(
      `[API] http://localhost:${PORT}/api/messages  (profil: ${PROFILE_ID})`,
    );
  });
}

main().catch((err) => {
  console.error("[Startup] Fatal:", err.message);
  process.exit(1);
});
