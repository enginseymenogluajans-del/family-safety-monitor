"""
iTunes/Finder yerel iPhone backup'tan veri çıkarır.
Hem şifreli (passphrase ile) hem şifresiz backup'ları destekler.
"""
import shutil
import sqlite3
import tempfile
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from .models import SMSMessage, CallRecord
from .content_filter import analyze_whatsapp_message

try:
    from iphone_backup_decrypt import EncryptedBackup
    _HAVE_LIB = True
except ImportError:
    EncryptedBackup = None
    _HAVE_LIB = False

# Dosya yolları (iphone_backup_decrypt string sabitleri ile aynı)
_PATH_SMS        = "HomeDomain/Library/SMS/sms.db"
_PATH_CALLS      = "HomeDomain/Library/CallHistoryDB/CallHistory.storedata"

# profile_id → (EncryptedBackup | None, backup_dir: str)
_backups: dict[str, tuple] = {}

_APPLE_EPOCH = 978307200  # 2001-01-01 Unix timestamp


def _apple_ts(ts) -> datetime:
    """Core Data / Apple epoch değerini UTC datetime'a çevirir."""
    if ts is None:
        return datetime.now(timezone.utc)
    val = float(ts)
    if val > 1_000_000_000_000:   # nanosaniye (SMS)
        val /= 1e9
    return datetime.fromtimestamp(val + _APPLE_EPOCH, tz=timezone.utc)


# ── Bağlantı yönetimi ─────────────────────────────────────────────────────────

def connect(profile_id: str, backup_path: str, passphrase: Optional[str] = None) -> dict:
    backup_dir = Path(backup_path)
    if not backup_dir.exists():
        return {"connected": False, "error": f"Backup dizini bulunamadı: {backup_path}"}
    if not (backup_dir / "Manifest.db").exists():
        return {"connected": False, "error": "Geçerli bir iPhone backup değil (Manifest.db yok)."}

    backup_obj = None
    warning = None

    if _HAVE_LIB:
        try:
            kwargs = {"backup_directory": str(backup_dir)}
            if passphrase:
                kwargs["passphrase"] = passphrase
            backup_obj = EncryptedBackup(**kwargs)
        except Exception as e:
            warning = f"Şifreli erişim başarısız: {e}. Yalnızca Manifest okunacak."

    _backups[profile_id] = (backup_obj, str(backup_dir))
    result: dict = {"connected": True, "backup_path": str(backup_dir)}
    if warning:
        result["warning"] = warning
    return result


def is_connected(profile_id: str) -> bool:
    return profile_id in _backups


def disconnect(profile_id: str):
    _backups.pop(profile_id, None)


def get_backup_object(profile_id: str):
    """EncryptedBackup nesnesini döner (app_scanner için)."""
    entry = _backups.get(profile_id)
    return entry[0] if entry else None


def get_backup_dir(profile_id: str) -> Optional[str]:
    entry = _backups.get(profile_id)
    return entry[1] if entry else None


# ── Dosya çıkarma ─────────────────────────────────────────────────────────────

def _extract_db(profile_id: str, full_path: str, tmp_dir: str) -> Optional[str]:
    """Backup'tan bir SQLite dosyasını geçici dizine çıkarır, path döner."""
    entry = _backups.get(profile_id)
    if not entry:
        return None
    backup_obj, backup_dir_str = entry
    out = os.path.join(tmp_dir, "extracted.db")

    if backup_obj is not None:
        try:
            backup_obj.extract_file(relative_path=full_path, output_filename=out)
            if os.path.exists(out):
                return out
        except Exception:
            pass

    # Şifresiz fallback: Manifest.db'den SHA1 hash ile dosyayı bul
    return _extract_unencrypted(backup_dir_str, full_path, out)


def _extract_unencrypted(backup_dir: str, full_path: str, output_path: str) -> Optional[str]:
    """
    Şifresiz backup: Manifest.db'de (domain, relativePath) → fileID hash eşleşmesini kullanır.
    full_path: "HomeDomain/Library/SMS/sms.db" gibi domain/... formatı
    """
    parts = full_path.split("/", 1)
    if len(parts) != 2:
        return None
    domain, rel_path = parts

    manifest = Path(backup_dir) / "Manifest.db"
    try:
        conn = sqlite3.connect(str(manifest))
        cur = conn.cursor()
        cur.execute(
            "SELECT fileID FROM Files WHERE domain=? AND relativePath=?",
            (domain, rel_path),
        )
        row = cur.fetchone()
        conn.close()
    except Exception:
        return None

    if not row:
        return None

    file_hash = row[0]
    src = Path(backup_dir) / file_hash[:2] / file_hash
    if src.exists():
        shutil.copy2(str(src), output_path)
        return output_path
    return None


# ── SMS mesajları ─────────────────────────────────────────────────────────────

def get_sms_messages(profile_id: str, limit: int = 200) -> list[SMSMessage]:
    """sms.db'den mesajları okur; içerik filtresi ve risk analizi uygular."""
    messages: list[SMSMessage] = []
    with tempfile.TemporaryDirectory() as tmp:
        db_path = _extract_db(profile_id, _PATH_SMS, tmp)
        if not db_path:
            return messages
        try:
            conn = sqlite3.connect(db_path)
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            cur.execute(
                """
                SELECT m.rowid, m.text, m.date, m.is_from_me, m.is_read,
                       h.id AS phone_number
                FROM   message m
                LEFT JOIN handle h ON m.handle_id = h.rowid
                ORDER  BY m.date DESC
                LIMIT  ?
                """,
                (limit,),
            )
            for row in cur.fetchall():
                text = row["text"] or ""
                filtered, is_redacted, risk_level, risk_cats = analyze_whatsapp_message(text)
                messages.append(
                    SMSMessage(
                        profile_id=profile_id,
                        sender=row["phone_number"] or "Bilinmiyor",
                        text=filtered,
                        timestamp=_apple_ts(row["date"]),
                        is_read=bool(row["is_read"]),
                        is_from_me=bool(row["is_from_me"]),
                        is_redacted=is_redacted,
                        risk_level=risk_level.value,
                        risk_categories=risk_cats,
                    )
                )
            conn.close()
        except Exception:
            pass
    return messages


def get_flagged_sms(profile_id: str, limit: int = 200) -> list[SMSMessage]:
    """Sadece riskli veya redakte edilmiş SMS'leri döner."""
    msgs = get_sms_messages(profile_id, limit=limit)
    return [m for m in msgs if m.risk_level != "none" or m.is_redacted]


# ── Arama geçmişi ─────────────────────────────────────────────────────────────

def get_call_records(profile_id: str, limit: int = 200) -> list[CallRecord]:
    """CallHistory.storedata'dan arama kayıtlarını okur."""
    records: list[CallRecord] = []
    with tempfile.TemporaryDirectory() as tmp:
        db_path = _extract_db(profile_id, _PATH_CALLS, tmp)
        if not db_path:
            return records
        try:
            conn = sqlite3.connect(db_path)
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            cur.execute(
                """
                SELECT ZADDRESS, ZDURATION, ZDATE, ZORIGINATED, ZANSWERED
                FROM   ZCALLRECORD
                ORDER  BY ZDATE DESC
                LIMIT  ?
                """,
                (limit,),
            )
            for row in cur.fetchall():
                if row["ZANSWERED"] == 0:
                    call_type = "missed"
                elif row["ZORIGINATED"] == 1:
                    call_type = "outgoing"
                else:
                    call_type = "incoming"
                records.append(
                    CallRecord(
                        profile_id=profile_id,
                        phone_number=str(row["ZADDRESS"] or "Bilinmiyor"),
                        duration=int(row["ZDURATION"] or 0),
                        timestamp=_apple_ts(row["ZDATE"]),
                        call_type=call_type,
                    )
                )
            conn.close()
        except Exception:
            pass
    return records


# ── Manifest uygulama listesi ─────────────────────────────────────────────────

def get_manifest_bundle_ids(profile_id: str) -> list[str]:
    """Manifest.db'den 3. parti uygulama bundle ID'lerini döner."""
    entry = _backups.get(profile_id)
    if not entry:
        return []
    _, backup_dir_str = entry
    manifest_path = Path(backup_dir_str) / "Manifest.db"
    if not manifest_path.exists():
        return []
    try:
        conn = sqlite3.connect(str(manifest_path))
        cur = conn.cursor()
        cur.execute("SELECT DISTINCT domain FROM Files WHERE domain LIKE 'AppDomain-%'")
        rows = cur.fetchall()
        conn.close()
        result = []
        for (domain,) in rows:
            if domain.startswith("AppDomain-"):
                bid = domain[len("AppDomain-"):]
                # Sistem uygulamalarını atla
                if bid and not bid.startswith("com.apple."):
                    result.append(bid)
        return result
    except Exception:
        return []


# ── Takvim etkinlikleri ───────────────────────────────────────────────────────

_PATH_CALENDAR = "HomeDomain/Library/Calendar/Calendar.sqlitedb"


def get_calendar_events(profile_id: str, limit: int = 100) -> list[dict]:
    """Calendar.sqlitedb'den takvim etkinliklerini okur."""
    events: list[dict] = []
    with tempfile.TemporaryDirectory() as tmp:
        db_path = _extract_db(profile_id, _PATH_CALENDAR, tmp)
        if not db_path:
            return events
        try:
            conn = sqlite3.connect(db_path)
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            cur.execute(
                """
                SELECT ci.summary, ci.description, ci.location,
                       ci.start_date, ci.end_date, ci.all_day
                FROM   CalendarItem ci
                ORDER  BY ci.start_date DESC
                LIMIT  ?
                """,
                (limit,),
            )
            for row in cur.fetchall():
                events.append({
                    "title":       row["summary"] or "",
                    "description": row["description"] or "",
                    "location":    row["location"] or "",
                    "start":       _apple_ts(row["start_date"]).isoformat() if row["start_date"] else None,
                    "end":         _apple_ts(row["end_date"]).isoformat() if row["end_date"] else None,
                    "all_day":     bool(row["all_day"]),
                })
            conn.close()
        except Exception:
            pass
    return events


# ── Tarayıcı geçmişi (yerel backup) ──────────────────────────────────────────

_PATH_SAFARI_HISTORY = "AppDomain-com.apple.mobilesafari/Library/Safari/History.db"


def get_browser_history(profile_id: str, limit: int = 200) -> list:
    """Safari History.db'den tarayıcı geçmişini okur (yalnızca şifreli backup'ta mevcut)."""
    from .browser_history import parse_safari_db
    with tempfile.TemporaryDirectory() as tmp:
        db_path = _extract_db(profile_id, _PATH_SAFARI_HISTORY, tmp)
        if not db_path:
            return []
        return parse_safari_db(profile_id, db_path, limit)


# ── Tarayıcı yer imleri ───────────────────────────────────────────────────────

_PATH_SAFARI_BOOKMARKS = "HomeDomain/Library/Safari/Bookmarks.db"


def get_browser_bookmarks(profile_id: str, limit: int = 200) -> list[dict]:
    """Safari Bookmarks.db'den yer imlerini okur."""
    bookmarks: list[dict] = []
    with tempfile.TemporaryDirectory() as tmp:
        db_path = _extract_db(profile_id, _PATH_SAFARI_BOOKMARKS, tmp)
        if not db_path:
            return bookmarks
        try:
            conn = sqlite3.connect(db_path)
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            cur.execute(
                """
                SELECT b.title, u.url
                FROM   bookmarks b
                LEFT JOIN bookmarkURLs u ON b.id = u.bookmark_id
                WHERE  u.url IS NOT NULL AND u.url != ''
                ORDER  BY b.id DESC
                LIMIT  ?
                """,
                (limit,),
            )
            for row in cur.fetchall():
                bookmarks.append({
                    "title": row["title"] or row["url"],
                    "url":   row["url"],
                })
            conn.close()
        except Exception:
            pass
    return bookmarks
