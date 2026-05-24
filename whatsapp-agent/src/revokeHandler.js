"use strict";

const db = require("./db");

// Fired when someone deletes a message "for everyone".
// Signature: (message, originalMessage)
//   message         — the revoke notification; carries the same id as the original
//   originalMessage — the original message object IF it was in whatsapp-web.js cache;
//                     null ~40% of the time (messages from before session start)
// Strategy: always use the DB as source of truth; never rely on originalMessage for body.
async function handleRevoke(message, _originalMessage) {
  try {
    const id = message.id._serialized;

    // Flip is_deleted flag; body is never touched
    const changes = await db.markDeleted(id);

    if (changes === 0) {
      // Message was sent before this session started — skip, nothing useful to show
      console.log(`[Revoke] Oturum öncesi silme, atlanıyor: ${id}`);
    } else {
      console.log(`[Revoke] Mesaj silindi olarak işaretlendi: ${id}`);
    }
  } catch (err) {
    console.error("[RevokeHandler] Hata:", err.message);
  }
}

module.exports = { handleRevoke };
