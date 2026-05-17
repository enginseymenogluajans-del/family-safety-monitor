import re
from enum import Enum
from typing import Tuple, List

_CARD_NUMBER_RE = re.compile(r'\b(\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4})\b')
_CVV_RE = re.compile(r'(?i)(cvv|cvc|güvenlik\s*kod[iu]|security\s*code)\s*[:\-]?\s*(\d{3,4})\b')
_PIN_RE = re.compile(r'(?i)(kart\s*şifre(?:si|m|n)?|pin\s*kod(?:u|um|un)?|atm\s*şifre(?:si|m|n)?)\s*[:\-]?\s*(\d{4,6})\b')
_IBAN_RE = re.compile(r'\b([A-Z]{2}\d{2}[\d\s]{10,30})\b')
_OTP_RE = re.compile(r'(?i)(doğrulama\s*kod[iu]?|verification\s*code|otp|tek\s*kullanım)\s*[:\-]?\s*(\d{4,8})\b')
_CRYPTO_RE = re.compile(r'(?i)(seed\s*phrase|mnemonic|private\s*key|cüzdan\s*şifre|wallet\s*key)\s*[:\-]?\s*\w+')

_CARD_IMAGE_KEYWORDS = ['kart','card','visa','mastercard','troy','amex','banka','bank','kredi','credit','debit']

# Finansal uygulama bundle ID'leri — bu uygulamaların ekran görüntüleri toplanmaz
BLOCKED_FINANCIAL_APPS = [
    'com.garanti.cepsubesi', 'com.isbankasi.iscepcanlisi',
    'com.akbank.softo', 'com.ziraatbankasi.ziraatmobil',
    'com.yapikredi.mobile', 'com.halkbank.mobile',
    'com.binance.exchange', 'com.btcturk.app', 'com.paribu.app',
    'com.agileBits.onepassword', 'com.apple.keychainaccess',
]


def redact_text(text: str) -> Tuple[str, bool]:
    """Hassas finansal bilgileri redakte eder. IBAN'a dokunmaz."""
    modified = False
    iban_placeholders = {}

    def save_iban(m):
        key = f"__IBAN_{len(iban_placeholders)}__"
        iban_placeholders[key] = m.group(0)
        return key

    text = _IBAN_RE.sub(save_iban, text)

    def redact_card(m):
        full = m.group(1).replace(' ', '').replace('-', '')
        return f"**** **** **** {full[-4:]}"

    new_text = _CARD_NUMBER_RE.sub(redact_card, text)
    if new_text != text: modified = True
    text = new_text

    def redact_cvv(m): return f"{m.group(1)}: [GİZLİ]"
    new_text = _CVV_RE.sub(redact_cvv, text)
    if new_text != text: modified = True
    text = new_text

    def redact_pin(m): return f"{m.group(1)}: [GİZLİ]"
    new_text = _PIN_RE.sub(redact_pin, text)
    if new_text != text: modified = True
    text = new_text

    def redact_otp(m): return f"{m.group(1)}: [GİZLİ]"
    new_text = _OTP_RE.sub(redact_otp, text)
    if new_text != text: modified = True
    text = new_text

    def redact_crypto(m): return "[KRİPTO BİLGİSİ GİZLENDİ]"
    new_text = _CRYPTO_RE.sub(redact_crypto, text)
    if new_text != text: modified = True
    text = new_text

    for key, value in iban_placeholders.items():
        text = text.replace(key, value)

    return text, modified


def is_card_image(filename: str, metadata: dict = None) -> bool:
    name_lower = filename.lower()
    for kw in _CARD_IMAGE_KEYWORDS:
        if kw in name_lower: return True
    if metadata:
        description = str(metadata).lower()
        for kw in _CARD_IMAGE_KEYWORDS:
            if kw in description: return True
    return False


def is_blocked_app(bundle_id: str) -> bool:
    """Finansal/hassas uygulama mı kontrol eder."""
    return bundle_id.lower() in [b.lower() for b in BLOCKED_FINANCIAL_APPS]


class RiskLevel(str, Enum):
    NONE = "none"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


_RISK_PATTERNS: List[Tuple[RiskLevel, List[str]]] = [
    (RiskLevel.HIGH, [
        r'\b(çocuk\s*porn|child\s*porn|cp\s+link|pedofil|lolita)\b',
        r'\b(tecavüz|rape\s+video|snuff)\b',
        r'\b(uyuşturucu|eroin|kokain|metamfetamin|uyuşturucu\s*sat)\b',
    ]),
    (RiskLevel.MEDIUM, [
        r'\b(seks\s*video|sex\s*tape|nude\s*photo|çıplak\s*foto|sikişme|am\s+ver|got\s+ver)\b',
        r'\b(onlyfans\.com|pornhub\.com|xvideos\.com|xnxx\.com|redtube\.com)\b',
        r'\b(webcam\s*show|cam\s*girl|escort\s*ilan|masaj\s*escort)\b',
        r'\b(kumar|bahis\s*oyna|slot\s*oyna|casino\s*kazan)\b',
    ]),
    (RiskLevel.LOW, [
        r'\b(buluşalım\s*mı\s*gizlice|sana\s*gel\s*mi|gizli\s*buluşma|randevu\s*atalım)\b',
        r'\b(tinder|badoo|grindr|bumble|happn)\b',
        r'\b(fotoğrafını\s*gönder|resim\s*at\s*bana|body\s*pic|dick\s*pic|sexy\s*photo)\b',
        r'\b(ailene\s*söyleme|kimseye\s*söyleme|sır\s*tutalım|bunu\s*bilmesin)\b',
    ]),
]

_COMPILED_PATTERNS = [
    (level, [re.compile(p, re.IGNORECASE | re.UNICODE) for p in patterns])
    for level, patterns in _RISK_PATTERNS
]


def classify_risk(text: str) -> Tuple[RiskLevel, List[str]]:
    if not text: return RiskLevel.NONE, []
    matched_categories: List[str] = []
    highest_level = RiskLevel.NONE
    level_order = {RiskLevel.NONE: 0, RiskLevel.LOW: 1, RiskLevel.MEDIUM: 2, RiskLevel.HIGH: 3}
    for level, patterns in _COMPILED_PATTERNS:
        for pattern in patterns:
            if pattern.search(text):
                matched_categories.append(level.value)
                if level_order[level] > level_order[highest_level]:
                    highest_level = level
                break
    return highest_level, list(set(matched_categories))


def analyze_whatsapp_message(text: str) -> Tuple[str, bool, RiskLevel, List[str]]:
    filtered_text, was_redacted = redact_text(text)
    risk_level, risk_categories = classify_risk(text)
    return filtered_text, was_redacted, risk_level, risk_categories
