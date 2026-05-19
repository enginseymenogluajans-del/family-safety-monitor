"""
Tarayıcı Geçmişi Analizi
Safari ve Chrome'un iCloud'a yedeklenen SQLite DB'lerini okur.
"""
from __future__ import annotations
import os
import sqlite3
import tempfile
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urlparse
from .models import BrowserHistoryItem

# Domain → (risk_level, category)
_DOMAIN_RISK: dict[str, tuple] = {
    # Adult — yüksek risk
    "pornhub.com":      ("high",   "adult"),
    "xvideos.com":      ("high",   "adult"),
    "xnxx.com":         ("high",   "adult"),
    "redtube.com":      ("high",   "adult"),
    "onlyfans.com":     ("high",   "adult"),
    "xhamster.com":     ("high",   "adult"),
    "youporn.com":      ("high",   "adult"),
    "brazzers.com":     ("high",   "adult"),
    "fansly.com":       ("high",   "adult"),

    # Gambling — orta risk
    "betboo.com":       ("medium", "gambling"),
    "youwin.com":       ("medium", "gambling"),
    "bets10.com":       ("medium", "gambling"),
    "nesine.com":       ("medium", "gambling"),
    "bilyoner.com":     ("medium", "gambling"),
    "misli.com":        ("medium", "gambling"),
    "superbahis.com":   ("medium", "gambling"),
    "betsson.com":      ("medium", "gambling"),

    # Dating — düşük risk
    "tinder.com":       ("low",    "dating"),
    "badoo.com":        ("low",    "dating"),
    "grindr.com":       ("low",    "dating"),
    "bumble.com":       ("low",    "dating"),
    "hinge.co":         ("low",    "dating"),
    "okcupid.com":      ("low",    "dating"),
}

# ⚠️ Gizli sekme uyarısı metni (frontend'de gösterilir)
PRIVATE_MODE_WARNING = (
    "Safari Özel Gezinti ve Chrome Gizli Mod geçmişi iOS tarafından "
    "hiçbir zaman diske yazılmaz. Bu sekmeler kapatılınca RAM'den silinir. "
    "Hiçbir araç bu veriyi göremez."
)


def _extract_domain(url: str) -> str:
    try:
        parsed = urlparse(url)
        host = parsed.netloc.lower()
        return host.replace("www.", "")
    except Exception:
        return ""


def _classify_url(url: str) -> tuple[str, Optional[str]]:
    domain = _extract_domain(url)
    for known_domain, (risk_level, category) in _DOMAIN_RISK.items():
        if domain == known_domain or domain.endswith("." + known_domain):
            return risk_level, category
    return "none", None


def parse_safari_db(profile_id: str, db_path: str, limit: int = 500) -> list[BrowserHistoryItem]:
    """Safari History.db SQLite dosyasını okur."""
    items = []
    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        # WAL checkpoint
        try: conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        except: pass

        cursor = conn.cursor()
        cursor.execute("""
            SELECT
                hi.url,
                hv.title,
                hv.visit_time,
                hi.visit_count
            FROM history_visits hv
            JOIN history_items hi ON hv.history_item = hi.id
            ORDER BY hv.visit_time DESC
            LIMIT ?
        """, (limit,))

        for row in cursor.fetchall():
            url = row["url"] or ""
            title = row["title"] or url
            visit_time_raw = row["visit_time"]
            visit_count = row["visit_count"] or 1

            # Safari Core Data timestamp (seconds since 2001-01-01)
            try:
                visit_time = datetime.fromtimestamp(float(visit_time_raw) + 978307200, tz=timezone.utc)
            except Exception:
                visit_time = None

            risk_level, risk_category = _classify_url(url)

            items.append(BrowserHistoryItem(
                profile_id=profile_id,
                url=url,
                title=title,
                visit_time=visit_time,
                browser="safari",
                risk_level=risk_level,
                risk_category=risk_category,
                visit_count=visit_count,
            ))
        conn.close()
    except Exception:
        pass
    return items


def parse_chrome_db(profile_id: str, db_path: str, limit: int = 500) -> list[BrowserHistoryItem]:
    """Chrome History SQLite dosyasını okur."""
    items = []
    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("""
            SELECT
                u.url,
                u.title,
                v.visit_time,
                u.visit_count
            FROM visits v
            JOIN urls u ON v.url = u.id
            ORDER BY v.visit_time DESC
            LIMIT ?
        """, (limit,))

        for row in cursor.fetchall():
            url = row["url"] or ""
            title = row["title"] or url
            visit_time_raw = row["visit_time"]
            visit_count = row["visit_count"] or 1

            # Chrome timestamp: microseconds since 1601-01-01
            try:
                ts = (float(visit_time_raw) / 1_000_000) - 11644473600
                visit_time = datetime.fromtimestamp(ts, tz=timezone.utc)
            except Exception:
                visit_time = None

            risk_level, risk_category = _classify_url(url)

            items.append(BrowserHistoryItem(
                profile_id=profile_id,
                url=url,
                title=title,
                visit_time=visit_time,
                browser="chrome",
                risk_level=risk_level,
                risk_category=risk_category,
                visit_count=visit_count,
            ))
        conn.close()
    except Exception:
        pass
    return items


def fetch_from_icloud(profile_id: str, api, limit: int = 500) -> list[BrowserHistoryItem]:
    """iCloud Drive'dan Safari/Chrome geçmişini indirir ve parse eder."""
    all_items: list[BrowserHistoryItem] = []

    # Safari
    try:
        safari_node = api.drive["Safari"]
        history_file = safari_node["History.db"]
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = os.path.join(tmpdir, "History.db")
            history_file.open(stream=True).raw.save(db_path)
            # WAL
            try:
                wal = safari_node["History.db-wal"]
                wal.open(stream=True).raw.save(db_path + "-wal")
            except (KeyError, AttributeError):
                pass
            all_items.extend(parse_safari_db(profile_id, db_path, limit))
    except (KeyError, AttributeError, Exception):
        pass

    # Chrome
    try:
        chrome_node = api.drive["Chrome"]
        default_node = chrome_node["Default"]
        chrome_history = default_node["History"]
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = os.path.join(tmpdir, "ChromeHistory")
            chrome_history.open(stream=True).raw.save(db_path)
            all_items.extend(parse_chrome_db(profile_id, db_path, limit))
    except (KeyError, AttributeError, Exception):
        pass

    return all_items


def get_flagged(items: list[BrowserHistoryItem]) -> list[BrowserHistoryItem]:
    return [i for i in items if i.risk_level != "none"]
