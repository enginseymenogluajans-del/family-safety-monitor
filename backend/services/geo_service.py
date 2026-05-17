"""
Geofencing Servisi
GÃ¼venli bÃ¶lge tanÄ±mla, konum kontrolÃ¼ yap, uyarÄ± Ã¼ret.
"""
import math
from typing import Optional
import uuid
from datetime import datetime, timezone
from .models import SafeZone, GeofenceAlert, LocationData

# Profil baÅŸÄ±na gÃ¼venli bÃ¶lgeler (bellekte)
_zones: dict[str, list[SafeZone]] = {}
# Son uyarÄ±lar
_alerts: dict[str, list[GeofenceAlert]] = {}
# Ã–nceki konum durumu (bÃ¶lgede miydi?)
_last_state: dict[str, dict[str, bool]] = {}  # profile_id â†’ zone_id â†’ in_zone


def _haversine_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Ä°ki koordinat arasÄ±ndaki mesafeyi metre cinsinden hesaplar."""
    R = 6_371_000  # DÃ¼nya yarÄ±Ã§apÄ± metre
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def add_zone(profile_id: str, name: str, latitude: float, longitude: float,
             radius_meters: float = 200.0) -> SafeZone:
    """Yeni gÃ¼venli bÃ¶lge ekler."""
    zone = SafeZone(
        zone_id=str(uuid.uuid4()),
        profile_id=profile_id,
        name=name,
        latitude=latitude,
        longitude=longitude,
        radius_meters=radius_meters,
    )
    _zones.setdefault(profile_id, []).append(zone)
    return zone


def get_zones(profile_id: str) -> list[SafeZone]:
    return _zones.get(profile_id, [])


def delete_zone(profile_id: str, zone_id: str) -> bool:
    zones = _zones.get(profile_id, [])
    new_zones = [z for z in zones if z.zone_id != zone_id]
    _zones[profile_id] = new_zones
    return len(new_zones) < len(zones)


def check_location(profile_id: str, location: LocationData) -> tuple[bool, Optional[str], list[GeofenceAlert]]:
    """
    Konumu tÃ¼m bÃ¶lgelere karÅŸÄ± kontrol eder.
    Returns: (in_any_zone, zone_name, new_alerts)
    """
    from typing import Optional
    zones = _zones.get(profile_id, [])
    new_alerts: list[GeofenceAlert] = []
    in_any_zone = False
    current_zone_name = None
    prev_state = _last_state.setdefault(profile_id, {})

    for zone in zones:
        if not zone.active:
            continue
        distance = _haversine_meters(
            location.latitude, location.longitude,
            zone.latitude, zone.longitude
        )
        currently_inside = distance <= zone.radius_meters
        was_inside = prev_state.get(zone.zone_id, True)  # Ä°lk kontrolde iÃ§eride sayÄ±lÄ±r

        if currently_inside:
            in_any_zone = True
            current_zone_name = zone.name

        # BÃ¶lgeden Ã§Ä±kÄ±ÅŸ tespiti
        if was_inside and not currently_inside:
            alert = GeofenceAlert(
                profile_id=profile_id,
                zone_name=zone.name,
                event="exited",
                latitude=location.latitude,
                longitude=location.longitude,
                timestamp=datetime.now(timezone.utc),
            )
            new_alerts.append(alert)
            _alerts.setdefault(profile_id, []).append(alert)

        # BÃ¶lgeye giriÅŸ tespiti
        elif not was_inside and currently_inside:
            alert = GeofenceAlert(
                profile_id=profile_id,
                zone_name=zone.name,
                event="entered",
                latitude=location.latitude,
                longitude=location.longitude,
                timestamp=datetime.now(timezone.utc),
            )
            new_alerts.append(alert)
            _alerts.setdefault(profile_id, []).append(alert)

        prev_state[zone.zone_id] = currently_inside

    return in_any_zone, current_zone_name, new_alerts


def get_alerts(profile_id: str, limit: int = 50) -> list[GeofenceAlert]:
    return _alerts.get(profile_id, [])[-limit:]


def get_exit_alerts(profile_id: str) -> list[GeofenceAlert]:
    return [a for a in _alerts.get(profile_id, []) if a.event == "exited"]

