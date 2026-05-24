"use strict";

const express = require("express");
const db = require("./db");
const state = require("./state");
const QRCode = require("qrcode");

const router = express.Router();
const PROFILE_ID = process.env.PROFILE_ID || "default";

// Maps a DB row to the WhatsAppMessage JSON shape used by the Python backend.
// Field names match the Pydantic model in backend/services/models.py exactly.
function rowToMessage(row) {
  let risk_categories = [];
  try {
    risk_categories = JSON.parse(row.risk_categories || "[]");
  } catch (_) {}
  return {
    profile_id: row.profile_id,
    chat_name: row.chat_name,
    sender: row.sender,
    text: row.body,
    timestamp: row.timestamp,
    is_redacted: Boolean(row.is_redacted),
    risk_level: row.risk_level,
    risk_categories,
    is_deleted: Boolean(row.is_deleted),
    has_media: Boolean(row.has_media),
    message_type: null,
    is_from_me: Boolean(row.is_from_me),
    media_url: row.media_url || null,
    risk_score: row.risk_score,
  };
}

router.get("/api/messages", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
    const rows = await db.getMessages(PROFILE_ID, limit);
    // Oturum öncesi tombstone'ları filtrele
    const filtered = rows.filter(
      (r) => !(r.is_deleted && r.body && r.body.startsWith("[Silindi")),
    );
    res.json(filtered.map(rowToMessage));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/messages/flagged", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 200, 1000);
    const rows = await db.getFlaggedMessages(PROFILE_ID, limit);
    res.json(rows.map(rowToMessage));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/health", (_req, res) => {
  res.json({ status: "ok", profile_id: PROFILE_ID, uptime: process.uptime() });
});

router.get("/api/qr", async (_req, res) => {
  if (state.isConnected) {
    return res.json({ connected: true, qr_base64: null });
  }
  if (!state.latestQr) {
    return res.json({ connected: false, qr_base64: null, waiting: true });
  }
  try {
    const dataUrl = await QRCode.toDataURL(state.latestQr, {
      width: 300,
      margin: 2,
    });
    res.json({ connected: false, qr_base64: dataUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
