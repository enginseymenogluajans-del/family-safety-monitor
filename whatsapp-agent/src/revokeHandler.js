'use strict';

const db = require('./db');

const PROFILE_ID = process.env.PROFILE_ID || 'default';

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
            // Message was sent before this session started — insert a tombstone
            let chatName = message.from || '';
            try {
                const chat = await message.getChat();
                chatName = chat.name || chat.id.user || message.from || '';
            } catch (_) {}

            db.insertTombstone({
                id:              id,
                profile_id:      PROFILE_ID,
                chat_name:       chatName,
                sender:          message.from || '',
                body:            '[Silindi — mesaj oturum öncesinde gönderilmişti]',
                timestamp:       new Date(message.timestamp * 1000).toISOString(),
                is_from_me:      message.fromMe ? 1 : 0,
                has_media:       0,
                type:            'revoked',
                is_deleted:      1,
                is_redacted:     0,
                risk_level:      'none',
                risk_categories: '[]',
                risk_score:      0,
                media_url:       null,
            });

            console.log(`[Revoke] Tombstone eklendi (oturum öncesi): ${id}`);
        } else {
            console.log(`[Revoke] Mesaj silindi olarak işaretlendi: ${id}`);
        }
    } catch (err) {
        console.error('[RevokeHandler] Hata:', err.message);
    }
}

module.exports = { handleRevoke };
