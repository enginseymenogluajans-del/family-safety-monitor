"""
Uygulama Tespiti Servisi
iCloud Drive ve yerel backup manifest'ten uygulamaları tespit eder.
"""
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from .models import InstalledApp

# Bilinen uygulamalar: bundle_id → (display_name, category, risk_level)
_KNOWN_APPS: dict[str, tuple] = {
    # Dating — orta risk
    "com.cardify.tinder":         ("Tinder",    "dating",   "medium"),
    "com.badoo.BadooApp":         ("Badoo",     "dating",   "medium"),
    "com.grindr.grindr":          ("Grindr",    "dating",   "high"),
    "com.bumble.app":             ("Bumble",    "dating",   "medium"),
    "com.hinge.app":              ("Hinge",     "dating",   "medium"),
    "com.okcupid.okcupid":        ("OkCupid",   "dating",   "medium"),
    "com.happn.app":              ("Happn",     "dating",   "medium"),
    "com.leyou.app":              ("Leyou",     "dating",   "medium"),

    # Adult — yüksek risk
    "com.onlyfans.onlyfans":      ("OnlyFans",  "adult",    "high"),
    "com.fansly.app":             ("Fansly",    "adult",    "high"),

    # Gambling — orta risk
    "com.betboo.betboo":          ("Betboo",    "gambling", "medium"),
    "com.youwin.app":             ("Youwin",    "gambling", "medium"),
    "com.bets10.app":             ("Bets10",    "gambling", "medium"),
    "com.nesine.app":             ("Nesine",    "gambling", "medium"),
    "com.bilyoner.app":           ("Bilyoner",  "gambling", "medium"),

    # Chat — düşük risk (varlığı bilgi, içerik ayrı analiz edilir)
    "net.whatsapp.WhatsApp":      ("WhatsApp",  "chat",     "low"),
    "ph.telegra.Telegraph":       ("Telegram",  "chat",     "low"),
    "org.thoughtcrime.securesms": ("Signal",    "chat",     "low"),
    "com.hammerandchisel.discord":("Discord",   "chat",     "low"),

    # Social
    "com.instagram.Instagram":    ("Instagram", "social",   "low"),
    "com.zhiliaoapp.musically":   ("TikTok",    "social",   "low"),
    "com.burbn.instagram":        ("Instagram", "social",   "low"),
    "com.snapchat.snapchat":      ("Snapchat",  "social",   "low"),
    "com.twitter.twitter":        ("Twitter/X", "social",   "low"),
}

# iCloud Drive'da uygulama klasörü adları → bundle_id eşleştirmesi
_DRIVE_FOLDER_MAP: dict[str, str] = {
    "tinder":       "com.cardify.tinder",
    "badoo":        "com.badoo.BadooApp",
    "grindr":       "com.grindr.grindr",
    "bumble":       "com.bumble.app",
    "hinge":        "com.hinge.app",
    "onlyfans":     "com.onlyfans.onlyfans",
    "fansly":       "com.fansly.app",
    "betboo":       "com.betboo.betboo",
    "youwin":       "com.youwin.app",
    "bets10":       "com.bets10.app",
    "nesine":       "com.nesine.app",
    "bilyoner":     "com.bilyoner.app",
    "whatsapp":     "net.whatsapp.WhatsApp",
    "telegram":     "ph.telegra.Telegraph",
    "signal":       "org.thoughtcrime.securesms",
    "discord":      "com.hammerandchisel.discord",
    "instagram":    "com.instagram.Instagram",
    "tiktok":       "com.zhiliaoapp.musically",
    "snapchat":     "com.snapchat.snapchat",
}


def scan_from_drive(profile_id: str, drive_node) -> list[InstalledApp]:
    """iCloud Drive kök klasöründen uygulama tespiti yapar."""
    found: list[InstalledApp] = []
    detected_bundles: set[str] = set()
    try:
        folders = drive_node.dir()
        for folder_name in folders:
            key = folder_name.lower().strip()
            bundle_id = _DRIVE_FOLDER_MAP.get(key)
            if bundle_id and bundle_id not in detected_bundles:
                app = _make_app(profile_id, bundle_id, "drive_folder")
                if app:
                    found.append(app)
                    detected_bundles.add(bundle_id)
    except Exception:
        pass
    return found


def scan_from_folder_names(profile_id: str, folder_names: list[str]) -> list[InstalledApp]:
    """Klasör adı listesinden uygulama tespiti yapar."""
    found: list[InstalledApp] = []
    detected_bundles: set[str] = set()
    for folder_name in folder_names:
        key = folder_name.lower().strip()
        bundle_id = _DRIVE_FOLDER_MAP.get(key)
        if bundle_id and bundle_id not in detected_bundles:
            app = _make_app(profile_id, bundle_id, "drive_folder")
            if app:
                found.append(app)
                detected_bundles.add(bundle_id)
    return found


def _make_app(profile_id: str, bundle_id: str, detected_via: str) -> Optional[InstalledApp]:
    info = _KNOWN_APPS.get(bundle_id)
    if not info:
        return None
    display_name, category, risk_level = info
    return InstalledApp(
        profile_id=profile_id,
        bundle_id=bundle_id,
        display_name=display_name,
        category=category,
        risk_level=risk_level,
        detected_via=detected_via,
        detected_at=datetime.now(timezone.utc),
    )


def get_flagged(apps: list[InstalledApp]) -> list[InstalledApp]:
    """Sadece riskli uygulamaları döner."""
    return [a for a in apps if a.risk_level in ("medium", "high")]


def scan_from_backup(profile_id: str, backup) -> list[InstalledApp]:
    """
    iTunes/Finder backup Manifest.db'den tam uygulama listesi çıkarır.
    scan_from_drive'a göre çok daha kapsamlı: tüm 3. parti uygulamaları içerir.

    backup: EncryptedBackup nesnesi ya da backup dizin yolu (str/Path).
    """
    # Backup dizinini belirle
    if isinstance(backup, (str, Path)):
        backup_dir = Path(backup)
    else:
        # EncryptedBackup nesnesi — backup_directory özelliğini dene
        raw = getattr(backup, "backup_directory", None) or getattr(backup, "_backup_directory", None)
        if not raw:
            return []
        backup_dir = Path(str(raw))

    manifest_path = backup_dir / "Manifest.db"
    if not manifest_path.exists():
        return []

    try:
        conn = sqlite3.connect(str(manifest_path))
        cur = conn.cursor()
        cur.execute(
            "SELECT DISTINCT domain FROM Files WHERE domain LIKE 'AppDomain-%'"
        )
        rows = cur.fetchall()
        conn.close()
    except Exception:
        return []

    found: list[InstalledApp] = []
    seen: set[str] = set()

    for (domain,) in rows:
        if not domain.startswith("AppDomain-"):
            continue
        bundle_id = domain[len("AppDomain-"):]
        if not bundle_id or bundle_id in seen or bundle_id.startswith("com.apple."):
            continue
        seen.add(bundle_id)

        if bundle_id in _KNOWN_APPS:
            app = _make_app(profile_id, bundle_id, "backup_manifest")
        else:
            # Bilinmeyen uygulama — kategori/risk belirsiz, listeye ekle
            app = InstalledApp(
                profile_id=profile_id,
                bundle_id=bundle_id,
                display_name=bundle_id.split(".")[-1].capitalize(),
                category="other",
                risk_level="none",
                detected_via="backup_manifest",
                detected_at=datetime.now(timezone.utc),
            )
        if app:
            found.append(app)

    return found
