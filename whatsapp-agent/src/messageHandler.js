'use strict';

const fs = require('fs');
const path = require('path');
const db = require('./db');
const { classifyRisk, calcRiskScore, redactText } = require('./contentFilter');

const MEDIA_DIR = path.join(__dirname, '..', 'data', 'media');
if (!fs.existsSync(MEDIA_DIR)) {
    fs.mkdirSync(MEDIA_DIR, { recursive: true });
}

const PROFILE_ID = process.env.PROFILE_ID || 'default';

async function handleMessage(msg) {
    try {
        // Skip system/revoked messages
        if (msg.type === 'revoked' || msg.type === 'e2e_notification' || msg.type === 'notification_template') {
            return;
        }

        // Sender: in group chats msg.author is the actual sender; msg.from is the group JID
        const sender = msg.fromMe ? 'me' : (msg.author || msg.from || '');

        // Chat name — async, may fail
        let chatName = msg.from || '';
        try {
            const chat = await msg.getChat();
            chatName = chat.name || chat.id.user || msg.from || '';
        } catch (_) {}

        // Body fallback for media-only messages
        const rawBody = msg.body || (msg.hasMedia ? '[Medya mesajı]' : '');

        // Redact financial data from body before storing
        const { redactedText, wasRedacted } = redactText(rawBody);

        // Risk classification on original (pre-redact) body
        const { riskLevel, riskCategories } = classifyRisk(rawBody);
        const riskScore = calcRiskScore(riskLevel, false, msg.hasMedia, msg.fromMe);

        // Handle Media Archiver - Download before it's deleted
        let localMediaPath = null;
        if (msg.hasMedia) {
            try {
                const media = await msg.downloadMedia();
                if (media) {
                    const ext = media.mimetype.split('/')[1].split(';')[0];
                    const filename = `${msg.id.id}.${ext}`;
                    const fullPath = path.join(MEDIA_DIR, filename);
                    fs.writeFileSync(fullPath, Buffer.from(media.data, 'base64'));
                    localMediaPath = `data/media/${filename}`;
                    console.log(`[MediaArchiver] Medya kaydedildi: ${filename}`);
                }
            } catch (mediaErr) {
                console.error('[MediaArchiver] İndirme hatası:', mediaErr.message);
            }
        }

        await db.insertMessage({
            id:              msg.id._serialized,
            profile_id:      PROFILE_ID,
            chat_name:       chatName,
            sender:          sender,
            body:            redactedText,
            timestamp:       new Date(msg.timestamp * 1000).toISOString(),
            is_from_me:      msg.fromMe ? 1 : 0,
            has_media:       msg.hasMedia ? 1 : 0,
            type:            msg.type || null,
            is_deleted:      0,
            is_redacted:     wasRedacted ? 1 : 0,
            risk_level:      riskLevel,
            risk_categories: JSON.stringify(riskCategories),
            risk_score:      riskScore,
            media_url:       localMediaPath, // Saved local path
        });
    } catch (err) {
        console.error('[MessageHandler] Hata:', err.message);
    }
}

module.exports = { handleMessage };
