"""
Supabase Heartbeat & Realtime Push Servisi

Her 30 saniyede device_status güncellemesi yapar.
Konum, bildirim ve ekran görüntülerini Supabase'e pushlar.
"""
from __future__ import annotations

import asyncio
import os
from datetime import datetime, timezone

import httpx

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_ANON_KEY", "")

_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",
}

_INSERT_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}

_WA_AGENT_URL = os.getenv("WA_AGENT_URL", "http://localhost:3001")


def _enabled() -> bool:
    return bool(SUPABASE_URL and SUPABASE_KEY)


async def _check_whatsapp() -> bool:
    try:
        async with httpx.AsyncClient(timeout=2.0) as c:
            r = await c.get(f"{_WA_AGENT_URL}/api/qr")
            return bool(r.json().get("connected", False))
    except Exception:
        return False


# ── Device Heartbeat ───────────────────────────────────────────────────────────

async def push_heartbeat(profile_id: str, extra: dict | None = None) -> None:
    """device_status tablosuna heartbeat yazar (upsert)."""
    if not _enabled():
        return

    wa_ok = await _check_whatsapp()
    payload = {
        "profile_id": profile_id,
        "agent_active": True,
        "wa_active": wa_ok,
        "last_seen": datetime.now(timezone.utc).isoformat(),
    }
    if extra:
        payload.update(extra)

    try:
        async with httpx.AsyncClient(timeout=5.0) as c:
            await c.post(
                f"{SUPABASE_URL}/rest/v1/device_status",
                json=payload,
                headers=_HEADERS,
            )
    except Exception:
        pass


# ── GPS Konum ─────────────────────────────────────────────────────────────────

async def push_location(
    profile_id: str,
    lat: float,
    lng: float,
    accuracy: float | None = None,
    timestamp: str | None = None,
) -> None:
    """gps_logs tablosuna konum INSERT eder → Realtime subscription tetiklenir."""
    if not _enabled():
        return

    payload = {
        "profile_id": profile_id,
        "latitude": lat,
        "longitude": lng,
        "accuracy": accuracy,
        "timestamp": timestamp or datetime.now(timezone.utc).isoformat(),
    }
    try:
        async with httpx.AsyncClient(timeout=5.0) as c:
            await c.post(
                f"{SUPABASE_URL}/rest/v1/gps_logs",
                json=payload,
                headers=_INSERT_HEADERS,
            )
    except Exception:
        pass


# ── Android Bildirimi ─────────────────────────────────────────────────────────

async def push_android_notification(profile_id: str, data: dict) -> None:
    """
    device_status tablosunda last_notification alanını günceller.
    Realtime dashboard anlık bildirim gösterir.
    """
    if not _enabled():
        return

    payload = {
        "profile_id": profile_id,
        "last_seen": datetime.now(timezone.utc).isoformat(),
        "last_notification_pkg": data.get("package", ""),
        "last_notification_title": data.get("title", ""),
        "last_notification_text": data.get("text", ""),
        "last_notification_event": data.get("event", "posted"),
    }
    try:
        async with httpx.AsyncClient(timeout=5.0) as c:
            await c.post(
                f"{SUPABASE_URL}/rest/v1/device_status",
                json=payload,
                headers=_HEADERS,
            )
    except Exception:
        pass


# ── Ekran Görüntüsü ───────────────────────────────────────────────────────────

async def push_screenshot(profile_id: str, image_url: str) -> None:
    """live_screenshots tablosuna yeni görüntü kaydı ekler."""
    if not _enabled():
        return

    payload = {"profile_id": profile_id, "image_url": image_url}
    try:
        async with httpx.AsyncClient(timeout=5.0) as c:
            await c.post(
                f"{SUPABASE_URL}/rest/v1/live_screenshots",
                json=payload,
                headers=_INSERT_HEADERS,
            )
    except Exception:
        pass


async def upload_screenshot_to_storage(
    profile_id: str,
    image_bytes: bytes,
    filename: str,
) -> str | None:
    """
    Ekran görüntüsünü Supabase Storage 'screenshots' bucket'ına yükler.
    Public URL döner. Hata olursa None döner (caller yerel URL'ye fallback yapar).
    """
    if not _enabled():
        return None

    bucket = "screenshots"
    object_path = f"{profile_id}/{filename}"
    upload_url = f"{SUPABASE_URL}/storage/v1/object/{bucket}/{object_path}"

    storage_headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "image/jpeg",
        "x-upsert": "true",
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as c:
            r = await c.post(upload_url, content=image_bytes, headers=storage_headers)
            if r.status_code in (200, 201):
                public_url = f"{SUPABASE_URL}/storage/v1/object/public/{bucket}/{object_path}"
                return public_url
    except Exception:
        pass
    return None


# ── Heartbeat Döngüsü ─────────────────────────────────────────────────────────

async def heartbeat_loop(profile_id: str, interval: int = 30) -> None:
    """FastAPI lifespan'ında asyncio.create_task() ile başlatılır."""
    while True:
        await push_heartbeat(profile_id)
        await asyncio.sleep(interval)
