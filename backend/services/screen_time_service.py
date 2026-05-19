"""
iOS Screen Time verisini iPhone backup'taki knowledgeC.db'den çıkarır.
Veri kaynağı: HomeDomain/Library/CoreDuet/Knowledge/knowledgeC.db
ZOBJECT tablosunda ZSTREAMNAME = '/app/usage' kayıtları.
"""
from __future__ import annotations

import sqlite3
import tempfile
import os
from datetime import datetime, timezone, timedelta
from typing import Optional

from . import local_backup_service

_PATH_KNOWLEDGE = "HomeDomain/Library/CoreDuet/Knowledge/knowledgeC.db"
_APPLE_EPOCH = 978307200  # 2001-01-01 Unix timestamp

# Yaygın bundle ID → kullanıcı dostu isim
_BUNDLE_NAMES: dict[str, str] = {
    "com.apple.MobileSafari": "Safari",
    "com.apple.mobileslideshow": "Fotoğraflar",
    "com.apple.mobilephone": "Telefon",
    "com.apple.MobileAddressBook": "Rehber",
    "com.apple.Music": "Müzik",
    "com.apple.youtube": "YouTube",
    "com.google.ios.youtube": "YouTube",
    "com.instagram.Instagram": "Instagram",
    "com.facebook.Facebook": "Facebook",
    "net.whatsapp.WhatsApp": "WhatsApp",
    "com.burbn.instagram": "Instagram",
    "com.atebits.Tweetie2": "Twitter/X",
    "com.twitter.ios": "Twitter/X",
    "com.snapchat.snapchat": "Snapchat",
    "com.zhiliaoapp.musically": "TikTok",
    "com.tiktok.TikTok": "TikTok",
    "com.apple.mobilemail": "Mail",
    "com.google.Gmail": "Gmail",
    "com.apple.AppStore": "App Store",
    "com.apple.Maps": "Haritalar",
    "com.apple.camera": "Kamera",
    "com.apple.mobiletimer": "Saat",
    "com.apple.Preferences": "Ayarlar",
    "com.apple.messages": "Mesajlar",
    "com.tencent.xin": "WeChat",
    "org.telegram.TelegramEnterprise": "Telegram",
    "ph.telegra.Telegraph": "Telegram",
}

# Kategori eşleştirme (bundle prefix bazlı)
_CATEGORIES: dict[str, str] = {
    "com.apple": "Sistem",
    "com.google": "Google",
    "com.instagram": "Sosyal",
    "com.facebook": "Sosyal",
    "net.whatsapp": "Sosyal",
    "com.snapchat": "Sosyal",
    "com.tiktok": "Sosyal",
    "com.zhiliaoapp": "Sosyal",
    "com.atebits": "Sosyal",
    "com.twitter": "Sosyal",
    "ph.telegra": "Sosyal",
    "org.telegram": "Sosyal",
}


def _apple_ts(val) -> Optional[datetime]:
    if val is None:
        return None
    try:
        return datetime.fromtimestamp(float(val) + _APPLE_EPOCH, tz=timezone.utc)
    except Exception:
        return None


def _get_category(bundle_id: str) -> str:
    for prefix, cat in _CATEGORIES.items():
        if bundle_id.startswith(prefix):
            return cat
    return "Uygulama"


def get_screen_time(profile_id: str, days: int = 7) -> list[dict]:
    """
    Son `days` günün uygulama kullanım süresini döner.
    Her öğe: {bundle_id, name, category, total_seconds, sessions, last_used}
    """
    if not local_backup_service.is_connected(profile_id):
        return []

    with tempfile.TemporaryDirectory() as tmp:
        db_path = local_backup_service._extract_db(profile_id, _PATH_KNOWLEDGE, tmp)
        if not db_path:
            return []

        try:
            conn = sqlite3.connect(db_path)
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()

            cutoff_apple = (
                datetime.now(timezone.utc) - timedelta(days=days)
            ).timestamp() - _APPLE_EPOCH

            cur.execute(
                """
                SELECT
                    ZVALUESTRING as bundle_id,
                    ZSTARTDATE   as start_ts,
                    ZENDDATE     as end_ts
                FROM ZOBJECT
                WHERE ZSTREAMNAME = '/app/usage'
                  AND ZSTARTDATE  >= ?
                  AND ZVALUESTRING IS NOT NULL
                  AND ZENDDATE    > ZSTARTDATE
                ORDER BY ZSTARTDATE DESC
                """,
                (cutoff_apple,),
            )
            rows = cur.fetchall()
            conn.close()
        except Exception:
            return []

    # Aggregate per bundle_id
    agg: dict[str, dict] = {}
    for row in rows:
        bid = row["bundle_id"]
        duration = float(row["end_ts"] or 0) - float(row["start_ts"] or 0)
        if duration <= 0:
            continue
        last_dt = _apple_ts(row["end_ts"])
        if bid not in agg:
            agg[bid] = {
                "bundle_id": bid,
                "name": _BUNDLE_NAMES.get(bid, bid.split(".")[-1]),
                "category": _get_category(bid),
                "total_seconds": 0,
                "sessions": 0,
                "last_used": last_dt.isoformat() if last_dt else None,
            }
        agg[bid]["total_seconds"] += duration
        agg[bid]["sessions"] += 1
        # keep most recent
        if last_dt and agg[bid]["last_used"]:
            if last_dt.isoformat() > agg[bid]["last_used"]:
                agg[bid]["last_used"] = last_dt.isoformat()

    result = sorted(agg.values(), key=lambda x: x["total_seconds"], reverse=True)
    return result
