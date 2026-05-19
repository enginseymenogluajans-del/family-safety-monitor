"""
Supabase Heartbeat Servisi
Backend çalışırken her 30 saniyede bir device_status tablosunu güncelleyerek
cihazın online/offline durumunu, WhatsApp ajan durumunu ve son görülme zamanını yayınlar.
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

_WHATSAPP_AGENT_URL = "http://localhost:3001/api/qr"


async def _check_whatsapp() -> bool:
    """WhatsApp agent'ının çalışıp çalışmadığını kontrol eder."""
    try:
        async with httpx.AsyncClient(timeout=2.0) as c:
            r = await c.get(_WHATSAPP_AGENT_URL)
            data = r.json()
            return bool(data.get("connected", False))
    except Exception:
        return False


async def push_heartbeat(profile_id: str, extra: dict | None = None) -> None:
    """
    Supabase device_status tablosuna bir heartbeat yazar.
    extra: {"model": ..., "battery_level": ..., "wifi_ssid": ...} gibi alanlar eklenebilir.
    """
    if not SUPABASE_URL or not SUPABASE_KEY:
        return  # Supabase yapılandırılmamış, sessizce geç

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
    except Exception as e:
        pass  # Supabase erişilemez olsa bile backend çökmemeli


async def push_screenshot(profile_id: str, image_url: str) -> None:
    """
    Yeni ekran görüntüsünü Supabase live_screenshots tablosuna yazar.
    image_url: "/screenshots/filename.jpg" formatında relative path.
    """
    if not SUPABASE_URL or not SUPABASE_KEY:
        return

    payload = {
        "profile_id": profile_id,
        "image_url": image_url,
    }
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=5.0) as c:
            await c.post(
                f"{SUPABASE_URL}/rest/v1/live_screenshots",
                json=payload,
                headers=headers,
            )
    except Exception:
        pass


async def heartbeat_loop(profile_id: str, interval: int = 30) -> None:
    """
    Arka planda sonsuz heartbeat döngüsü — FastAPI lifespan'ında asyncio.create_task() ile başlatılır.
    """
    while True:
        await push_heartbeat(profile_id)
        await asyncio.sleep(interval)
