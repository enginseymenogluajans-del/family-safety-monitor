'use strict';

// JS port of backend/services/content_filter.py
// IMPORTANT: Do NOT add the 'g' flag to patterns used with .test() — it would
// advance lastIndex and cause alternating match/no-match on repeated calls.

const RISK_PATTERNS = [
    {
        level: 'high',
        patterns: [
            /\b(çocuk\s*porn|child\s*porn|cp\s+link|pedofil|lolita)\b/iu,
            /\b(tecavüz\s*video|rape\s*video|snuff\s*film)\b/iu,
            /\b(uyuşturucu\s*sat|eroin|kokain|metamfetamin|bonzai\s*sat|esrar\s*sat)\b/iu,
        ],
    },
    {
        level: 'medium',
        patterns: [
            /\b(seks\s*video|sex\s*tape|nude\s*photo|çıplak\s*foto|sikişme)\b/iu,
            /\b(onlyfans\.com|pornhub\.com|xvideos\.com|xnxx\.com|redtube\.com|xhamster\.com)\b/iu,
            /\b(webcam\s*show|cam\s*girl|escort\s*ilan|masaj\s*escort)\b/iu,
            /\b(kumar\s*oyna|bahis\s*oyna|slot\s*oyna|casino\s*kazan|iddaa\s*tahmin)\b/iu,
        ],
    },
    {
        level: 'low',
        patterns: [
            /\b(gizlice\s*buluş|gizli\s*buluşma|randevu\s*atalım\s*kimse\s*bilmesin)\b/iu,
            /\b(tinder|badoo|grindr|bumble|happn|blendr)\b/iu,
            /\b(fotoğrafını\s*gönder|resim\s*at\s*bana|body\s*pic|dick\s*pic|sexy\s*photo|çıplak\s*gönder)\b/iu,
            /\b(ailene\s*söyleme|kimseye\s*söyleme|sır\s*tutalım|bunu\s*bilmesin|annene\s*söyleme)\b/iu,
        ],
    },
];

const LEVEL_ORDER = { none: 0, low: 1, medium: 2, high: 3 };
const BASE_SCORES  = { none: 0, low: 15, medium: 35, high: 60 };

function classifyRisk(text) {
    if (!text) return { riskLevel: 'none', riskCategories: [], riskScore: 0 };

    let highestLevel = 'none';
    const matchedCategories = new Set();

    for (const { level, patterns } of RISK_PATTERNS) {
        for (const pattern of patterns) {
            if (pattern.test(text)) {
                matchedCategories.add(level);
                if (LEVEL_ORDER[level] > LEVEL_ORDER[highestLevel]) {
                    highestLevel = level;
                }
                break;
            }
        }
    }

    return {
        riskLevel: highestLevel,
        riskCategories: [...matchedCategories],
        riskScore: 0, // caller computes final score with deletion flags
    };
}

function calcRiskScore(riskLevel, isDeleted, hasMedia, isFromMe) {
    let score = BASE_SCORES[riskLevel] ?? 0;
    if (isDeleted && hasMedia)      score += 30;
    else if (isDeleted && isFromMe) score += 25;
    else if (isDeleted)             score += 15;
    return Math.min(score, 100);
}

// ── Financial redaction ──────────────────────────────────────────────────────

const CARD_RE   = /\b(\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4})\b/g;
const CVV_RE    = /(cvv|cvc|güvenlik\s*kod[iu]|security\s*code)\s*[:\-]?\s*(\d{3,4})\b/gi;
const PIN_RE    = /(kart\s*şifre(?:si|m|n)?|pin\s*kod(?:u|um|un)?|atm\s*şifre(?:si|m|n)?)\s*[:\-]?\s*(\d{4,6})\b/gi;
const OTP_RE    = /(doğrulama\s*kod[iu]?|verification\s*code|otp|tek\s*kullanım)\s*[:\-]?\s*(\d{4,8})\b/gi;
const CRYPTO_RE = /(seed\s*phrase|mnemonic|private\s*key|cüzdan\s*şifre|wallet\s*key)\s*[:\-]?\s*\S+/gi;
const IBAN_RE   = /\b([A-Z]{2}\d{2}[\d\s]{10,30})\b/g;

function redactText(text) {
    if (!text) return { redactedText: text, wasRedacted: false };

    let t = text;
    let modified = false;

    // Preserve IBANs via placeholders so card regex doesn't clobber them
    const ibanMap = {};
    let ibanIdx = 0;
    t = t.replace(IBAN_RE, (m) => {
        const key = `__IBAN${ibanIdx++}__`;
        ibanMap[key] = m;
        return key;
    });

    function rep(re, fn) {
        const result = t.replace(re, fn);
        if (result !== t) modified = true;
        t = result;
    }

    rep(CARD_RE,   (_, num) => {
        const digits = num.replace(/[\s-]/g, '');
        return `**** **** **** ${digits.slice(-4)}`;
    });
    rep(CVV_RE,    (_, label) => `${label}: [GİZLİ]`);
    rep(PIN_RE,    (_, label) => `${label}: [GİZLİ]`);
    rep(OTP_RE,    (_, label) => `${label}: [GİZLİ]`);
    rep(CRYPTO_RE, ()         => '[KRİPTO BİLGİSİ GİZLENDİ]');

    // Restore IBANs
    for (const [key, val] of Object.entries(ibanMap)) {
        t = t.replace(key, val);
    }

    return { redactedText: t, wasRedacted: modified };
}

module.exports = { classifyRisk, calcRiskScore, redactText };
