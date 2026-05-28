"""
Kalıcı SQLite depolama servisi.
Konum geçmişi, mesajlar, AI alarmları ve risk olaylarını saklar.
DB dosyası: backend/data/family_safety.db
"""
from __future__ import annotations
import json
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

DB_PATH = Path(__file__).parent.parent / "data" / "family_safety.db"


def _conn() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db() -> None:
    with _conn() as db:
        db.executescript("""
            CREATE TABLE IF NOT EXISTS locations (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                profile_id  TEXT    NOT NULL,
                latitude    REAL    NOT NULL,
                longitude   REAL    NOT NULL,
                accuracy    REAL,
                device_name TEXT,
                battery     REAL,
                timestamp   TEXT    NOT NULL,
                created_at  TEXT    DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_loc_profile
                ON locations(profile_id, timestamp DESC);

            CREATE TABLE IF NOT EXISTS messages (
                id          TEXT    PRIMARY KEY,
                profile_id  TEXT    NOT NULL,
                chat_name   TEXT,
                sender      TEXT,
                text        TEXT,
                timestamp   TEXT    NOT NULL,
                is_deleted  INTEGER DEFAULT 0,
                has_media   INTEGER DEFAULT 0,
                is_from_me  INTEGER DEFAULT 0,
                risk_level  TEXT    DEFAULT 'none',
                risk_score  INTEGER DEFAULT 0,
                source      TEXT    DEFAULT 'icloud',
                created_at  TEXT    DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_msg_profile
                ON messages(profile_id, timestamp DESC);
            CREATE INDEX IF NOT EXISTS idx_msg_deleted
                ON messages(is_deleted) WHERE is_deleted = 1;

            CREATE TABLE IF NOT EXISTS alerts (
                id          TEXT    PRIMARY KEY,
                profile_id  TEXT    NOT NULL,
                level       TEXT    NOT NULL,
                title       TEXT    NOT NULL,
                description TEXT,
                source      TEXT,
                count       INTEGER DEFAULT 1,
                dismissed   INTEGER DEFAULT 0,
                created_at  TEXT    DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_alert_profile
                ON alerts(profile_id, created_at DESC);

            CREATE TABLE IF NOT EXISTS risk_events (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                profile_id  TEXT    NOT NULL,
                event_type  TEXT    NOT NULL,
                description TEXT,
                score       INTEGER DEFAULT 0,
                timestamp   TEXT    NOT NULL,
                data        TEXT,
                created_at  TEXT    DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_risk_profile
                ON risk_events(profile_id, timestamp DESC);
            CREATE TABLE IF NOT EXISTS wifi_connections (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                profile_id    TEXT    NOT NULL,
                ssid          TEXT    NOT NULL,
                bssid         TEXT,
                signal_dbm    INTEGER,
                security_type TEXT    DEFAULT 'unknown',
                is_open       INTEGER DEFAULT 0,
                frequency_mhz INTEGER,
                latitude      REAL,
                longitude     REAL,
                connected_at  TEXT    NOT NULL,
                duration_sec  INTEGER DEFAULT 0,
                created_at    TEXT    DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_wifi_profile
                ON wifi_connections(profile_id, connected_at DESC);

            CREATE TABLE IF NOT EXISTS app_usage (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                profile_id  TEXT    NOT NULL,
                app_name    TEXT    NOT NULL,
                package     TEXT,
                date        TEXT    NOT NULL,
                minutes     INTEGER NOT NULL DEFAULT 0,
                launches    INTEGER NOT NULL DEFAULT 0,
                platform    TEXT    DEFAULT 'android',
                created_at  TEXT    DEFAULT (datetime('now')),
                UNIQUE(profile_id, app_name, date)
            );
            CREATE INDEX IF NOT EXISTS idx_usage_profile_date
                ON app_usage(profile_id, date DESC);

            CREATE TABLE IF NOT EXISTS app_limits (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                profile_id  TEXT    NOT NULL,
                app_name    TEXT    NOT NULL,
                package     TEXT,
                daily_limit_min INTEGER,
                allow_from  TEXT,
                allow_until TEXT,
                created_at  TEXT    DEFAULT (datetime('now')),
                UNIQUE(profile_id, app_name)
            );

            CREATE TABLE IF NOT EXISTS keywords (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                profile_id  TEXT NOT NULL,
                keyword     TEXT NOT NULL,
                scope       TEXT NOT NULL DEFAULT 'all',
                action      TEXT NOT NULL DEFAULT 'notify',
                created_at  TEXT DEFAULT (datetime('now')),
                UNIQUE(profile_id, keyword)
            );

            CREATE TABLE IF NOT EXISTS keyword_hits (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                profile_id  TEXT NOT NULL,
                keyword     TEXT NOT NULL,
                source      TEXT NOT NULL,
                sender      TEXT,
                matched_text TEXT,
                hit_at      TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS android_device_info (
                profile_id   TEXT PRIMARY KEY,
                model        TEXT,
                manufacturer TEXT,
                os_version   TEXT,
                battery      INTEGER,
                is_charging  INTEGER DEFAULT 0,
                wifi_ssid    TEXT,
                last_seen    TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS android_notifications (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                profile_id       TEXT    NOT NULL,
                event            TEXT    NOT NULL,
                package          TEXT    NOT NULL,
                title            TEXT,
                text             TEXT,
                notification_key TEXT,
                timestamp        TEXT    NOT NULL,
                original_posted_at TEXT,
                created_at       TEXT    DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_android_profile
                ON android_notifications(profile_id, timestamp DESC);

            CREATE TABLE IF NOT EXISTS profiles (
                id           TEXT PRIMARY KEY,
                name         TEXT NOT NULL,
                apple_id     TEXT NOT NULL,
                has_gmail    INTEGER DEFAULT 0,
                connected    INTEGER DEFAULT 0,
                requires_2fa INTEGER DEFAULT 0,
                daily_risk_score INTEGER DEFAULT 0,
                backup_path  TEXT
            );

            CREATE TABLE IF NOT EXISTS keystrokes (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                profile_id    TEXT    NOT NULL,
                app_name      TEXT    NOT NULL,
                text          TEXT    NOT NULL,
                timestamp     TEXT    NOT NULL,
                is_risk_alert INTEGER DEFAULT 0,
                risk_keyword  TEXT    DEFAULT NULL,
                created_at    TEXT    DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_key_profile
                ON keystrokes(profile_id, timestamp DESC);
        """)
        # Migrations
        for col, ddl in [
            ("backup_path",   "ALTER TABLE profiles ADD COLUMN backup_path TEXT"),
            ("is_risk_alert", "ALTER TABLE keystrokes ADD COLUMN is_risk_alert INTEGER DEFAULT 0"),
            ("risk_keyword",  "ALTER TABLE keystrokes ADD COLUMN risk_keyword TEXT DEFAULT NULL"),
        ]:
            try:
                db.execute(ddl)
            except Exception:
                pass  # Column already exists


# ── Konum ───────────────────────────────────────────────────────────────────

def save_location(profile_id: str, latitude: float, longitude: float,
                  accuracy: float | None, device_name: str,
                  battery: float | None, timestamp: str) -> None:
    with _conn() as db:
        db.execute(
            """INSERT INTO locations
               (profile_id, latitude, longitude, accuracy, device_name, battery, timestamp)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (profile_id, latitude, longitude, accuracy, device_name, battery, timestamp),
        )


def get_location_history(profile_id: str, limit: int = 50) -> list[dict]:
    with _conn() as db:
        rows = db.execute(
            "SELECT * FROM locations WHERE profile_id=? ORDER BY timestamp DESC LIMIT ?",
            (profile_id, limit),
        ).fetchall()
    return [dict(r) for r in rows]


# ── Mesajlar ─────────────────────────────────────────────────────────────────

def save_messages(messages: list[Any], source: str = "icloud") -> None:
    if not messages:
        return
    rows = []
    for m in messages:
        ts = str(getattr(m, "timestamp", ""))
        # Bileşik anahtar: profil + zaman + gönderen
        msg_id = f"{getattr(m,'profile_id','')}-{ts}-{getattr(m,'sender','')}-{getattr(m,'chat_name','')}"
        rows.append((
            msg_id,
            getattr(m, "profile_id", ""),
            getattr(m, "chat_name", ""),
            getattr(m, "sender", ""),
            getattr(m, "text", ""),
            ts,
            int(bool(getattr(m, "is_deleted", False))),
            int(bool(getattr(m, "has_media",  False))),
            int(bool(getattr(m, "is_from_me", False))),
            getattr(m, "risk_level",  "none"),
            getattr(m, "risk_score",  0),
            source,
        ))
    with _conn() as db:
        db.executemany(
            """INSERT OR IGNORE INTO messages
               (id, profile_id, chat_name, sender, text, timestamp,
                is_deleted, has_media, is_from_me, risk_level, risk_score, source)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            rows,
        )


def get_message_history(profile_id: str, limit: int = 200,
                        deleted_only: bool = False) -> list[dict]:
    where = "profile_id=? AND is_deleted=1" if deleted_only else "profile_id=?"
    with _conn() as db:
        rows = db.execute(
            f"SELECT * FROM messages WHERE {where} ORDER BY timestamp DESC LIMIT ?",
            (profile_id, limit),
        ).fetchall()
    return [dict(r) for r in rows]


# ── Alarmlar ─────────────────────────────────────────────────────────────────

def save_alert(profile_id: str, alert_id: str, level: str,
               title: str, description: str, source: str, count: int) -> None:
    with _conn() as db:
        db.execute(
            """INSERT OR REPLACE INTO alerts
               (id, profile_id, level, title, description, source, count)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (f"{profile_id}-{alert_id}", profile_id, level, title, description, source, count),
        )


def get_alert_history(profile_id: str, limit: int = 100) -> list[dict]:
    with _conn() as db:
        rows = db.execute(
            """SELECT * FROM alerts
               WHERE profile_id=? AND dismissed=0
               ORDER BY created_at DESC LIMIT ?""",
            (profile_id, limit),
        ).fetchall()
    return [dict(r) for r in rows]


def dismiss_alert(profile_id: str, alert_id: str) -> None:
    with _conn() as db:
        db.execute(
            "UPDATE alerts SET dismissed=1 WHERE id=?",
            (f"{profile_id}-{alert_id}",),
        )


# ── Risk olayları ─────────────────────────────────────────────────────────────

def save_risk_event(profile_id: str, event_type: str, description: str,
                    score: int, timestamp: str, data: dict | None = None) -> None:
    with _conn() as db:
        db.execute(
            """INSERT INTO risk_events
               (profile_id, event_type, description, score, timestamp, data)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (profile_id, event_type, description, score, timestamp,
             json.dumps(data) if data else None),
        )


# ── Wi-Fi bağlantı geçmişi ───────────────────────────────────────────────────

def save_wifi_connection(profile_id: str, ssid: str, bssid: str | None,
                         signal_dbm: int | None, security_type: str,
                         is_open: bool, frequency_mhz: int | None,
                         latitude: float | None, longitude: float | None,
                         connected_at: str, duration_sec: int) -> None:
    with _conn() as db:
        db.execute(
            """INSERT INTO wifi_connections
               (profile_id, ssid, bssid, signal_dbm, security_type, is_open,
                frequency_mhz, latitude, longitude, connected_at, duration_sec)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (profile_id, ssid, bssid, signal_dbm, security_type,
             int(is_open), frequency_mhz, latitude, longitude,
             connected_at, duration_sec),
        )


def get_wifi_history(profile_id: str, limit: int = 100) -> list[dict]:
    with _conn() as db:
        rows = db.execute(
            """SELECT * FROM wifi_connections
               WHERE profile_id=? ORDER BY connected_at DESC LIMIT ?""",
            (profile_id, limit),
        ).fetchall()
    return [dict(r) for r in rows]


def get_flagged_wifi(profile_id: str, limit: int = 50) -> list[dict]:
    """Açık (şifresiz) veya zayıf sinyalli ağları döndürür."""
    with _conn() as db:
        rows = db.execute(
            """SELECT * FROM wifi_connections
               WHERE profile_id=? AND (is_open=1 OR signal_dbm < -80)
               ORDER BY connected_at DESC LIMIT ?""",
            (profile_id, limit),
        ).fetchall()
    return [dict(r) for r in rows]


# ── Uygulama kullanımı ────────────────────────────────────────────────────────

def upsert_app_usage(profile_id: str, app_name: str, package: str | None,
                     date: str, minutes: int, launches: int, platform: str) -> None:
    with _conn() as db:
        db.execute(
            """INSERT INTO app_usage
               (profile_id, app_name, package, date, minutes, launches, platform)
               VALUES (?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(profile_id, app_name, date)
               DO UPDATE SET minutes=excluded.minutes, launches=excluded.launches""",
            (profile_id, app_name, package, date, minutes, launches, platform),
        )


def get_app_usage(profile_id: str, date: str | None = None, limit: int = 100) -> list[dict]:
    with _conn() as db:
        if date:
            rows = db.execute(
                """SELECT * FROM app_usage WHERE profile_id=? AND date=?
                   ORDER BY minutes DESC LIMIT ?""",
                (profile_id, date, limit),
            ).fetchall()
        else:
            rows = db.execute(
                """SELECT * FROM app_usage WHERE profile_id=?
                   ORDER BY date DESC, minutes DESC LIMIT ?""",
                (profile_id, limit),
            ).fetchall()
    return [dict(r) for r in rows]


# ── Uygulama limitleri ────────────────────────────────────────────────────────

def save_app_limit(profile_id: str, app_name: str, package: str | None,
                   daily_limit_min: int | None,
                   allow_from: str | None, allow_until: str | None) -> None:
    with _conn() as db:
        db.execute(
            """INSERT INTO app_limits
               (profile_id, app_name, package, daily_limit_min, allow_from, allow_until)
               VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT(profile_id, app_name)
               DO UPDATE SET daily_limit_min=excluded.daily_limit_min,
                             allow_from=excluded.allow_from,
                             allow_until=excluded.allow_until,
                             package=excluded.package""",
            (profile_id, app_name, package, daily_limit_min, allow_from, allow_until),
        )


def get_app_limits(profile_id: str) -> list[dict]:
    with _conn() as db:
        rows = db.execute(
            "SELECT * FROM app_limits WHERE profile_id=? ORDER BY app_name",
            (profile_id,),
        ).fetchall()
    return [dict(r) for r in rows]


def delete_app_limit(profile_id: str, app_name: str) -> bool:
    with _conn() as db:
        cur = db.execute(
            "DELETE FROM app_limits WHERE profile_id=? AND app_name=?",
            (profile_id, app_name),
        )
    return cur.rowcount > 0


# ── Risk olayları ─────────────────────────────────────────────────────────────

def get_risk_event_history(profile_id: str, limit: int = 100) -> list[dict]:
    with _conn() as db:
        rows = db.execute(
            """SELECT * FROM risk_events
               WHERE profile_id=? ORDER BY timestamp DESC LIMIT ?""",
            (profile_id, limit),
        ).fetchall()
    result = []
    for r in rows:
        d = dict(r)
        d["data"] = json.loads(d["data"]) if d.get("data") else None
        result.append(d)
    return result


# ── Profiller ────────────────────────────────────────────────────────────────

def save_profile(p: Any) -> None:
    with _conn() as db:
        db.execute(
            """INSERT INTO profiles
               (id, name, apple_id, has_gmail, connected, requires_2fa, daily_risk_score, backup_path)
               VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
               ON CONFLICT(id) DO UPDATE SET
                   name=excluded.name,
                   apple_id=excluded.apple_id,
                   has_gmail=excluded.has_gmail,
                   connected=excluded.connected,
                   requires_2fa=excluded.requires_2fa,
                   daily_risk_score=excluded.daily_risk_score""",
            (p.id, p.name, p.apple_id, int(p.has_gmail), int(p.connected),
             int(p.requires_2fa), p.daily_risk_score),
        )


def save_backup_path(profile_id: str, backup_path: Optional[str]) -> None:
    """Profil için local backup yolunu kaydeder (SMS/Calls auto-reconnect için)."""
    with _conn() as db:
        db.execute(
            "UPDATE profiles SET backup_path=? WHERE id=?",
            (backup_path, profile_id),
        )


def load_profiles() -> list[dict]:
    with _conn() as db:
        rows = db.execute("SELECT * FROM profiles").fetchall()
    return [dict(r) for r in rows]


def delete_profile(profile_id: str) -> None:
    with _conn() as db:
        db.execute("DELETE FROM profiles WHERE id=?", (profile_id,))


# ── Android Bildirimleri ───────────────────────────────────────────────────────

def save_android_notification(profile_id: str, event: str, package: str,
                               title: str | None, text: str | None,
                               notification_key: str | None, timestamp: str,
                               original_posted_at: str | None = None) -> None:
    with _conn() as db:
        db.execute(
            """INSERT INTO android_notifications
               (profile_id, event, package, title, text, notification_key,
                timestamp, original_posted_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (profile_id, event, package, title, text, notification_key,
             timestamp, original_posted_at),
        )


def get_android_notifications(profile_id: str, limit: int = 200,
                               deleted_only: bool = False) -> list[dict]:
    where = "profile_id=? AND event='deleted'" if deleted_only else "profile_id=?"
    with _conn() as db:
        rows = db.execute(
            f"""SELECT * FROM android_notifications
                WHERE {where} ORDER BY timestamp DESC LIMIT ?""",
            (profile_id, limit),
        ).fetchall()
    return [dict(r) for r in rows]


def save_android_device_info(profile_id: str, info: dict) -> None:
    """Android cihaz bilgilerini upsert eder."""
    with _conn() as db:
        db.execute(
            """INSERT INTO android_device_info
               (profile_id, model, manufacturer, os_version, battery, is_charging, wifi_ssid, last_seen)
               VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
               ON CONFLICT(profile_id) DO UPDATE SET
                 model=excluded.model,
                 manufacturer=excluded.manufacturer,
                 os_version=excluded.os_version,
                 battery=excluded.battery,
                 is_charging=excluded.is_charging,
                 wifi_ssid=excluded.wifi_ssid,
                 last_seen=excluded.last_seen""",
            (
                profile_id,
                info.get("model"),
                info.get("manufacturer"),
                info.get("os_version"),
                info.get("battery"),
                1 if info.get("is_charging") else 0,
                info.get("wifi_ssid"),
            ),
        )


def get_android_device_info(profile_id: str):
    """Son kaydedilen Android cihaz bilgisini döndürür."""
    with _conn() as db:
        row = db.execute(
            "SELECT * FROM android_device_info WHERE profile_id=?", (profile_id,)
        ).fetchone()
    return dict(row) if row else None


# ── Klavye Takibi ────────────────────────────────────────────────────────────

def save_keystroke(profile_id: str, app_name: str, text: str,
                   is_risk_alert: bool = False, risk_keyword: str = None) -> None:
    """Klavye verisini veritabanına kaydeder."""
    with _conn() as db:
        db.execute(
            """INSERT INTO keystrokes
               (profile_id, app_name, text, timestamp, is_risk_alert, risk_keyword)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (profile_id, app_name, text, datetime.now().isoformat(),
             1 if is_risk_alert else 0, risk_keyword),
        )


def get_keystroke_history(profile_id: str, limit: int = 200) -> list[dict]:
    """Klavye geçmişini döndürür."""
    with _conn() as db:
        rows = db.execute(
            """SELECT app_name, text, timestamp, is_risk_alert, risk_keyword
               FROM keystrokes
               WHERE profile_id = ?
               ORDER BY timestamp DESC LIMIT ?""",
            (profile_id, limit),
        ).fetchall()
    return [dict(r) for r in rows]
