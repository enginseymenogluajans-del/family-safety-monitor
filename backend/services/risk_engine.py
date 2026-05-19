"""
Risk Skoru Motoru
Tüm olayları toplar, günlük risk raporu üretir, ebeveyne bildirim gönderir.
"""
from __future__ import annotations
from datetime import datetime, timezone, timedelta, date
from typing import Optional
from collections import defaultdict
from .models import RiskEvent, DailyRiskReport, NotificationConfig, WhatsAppMessage, InstalledApp, BrowserHistoryItem, GeofenceAlert
from . import db_service

# Profil başına ayarlar ve olaylar
_configs: dict[str, NotificationConfig] = {}
_events: dict[str, list[RiskEvent]] = {}

# Olay puan tablosu
_SCORE_TABLE = {
    "deleted_with_media":   40,
    "self_deleted":         30,
    "deleted_by_other":     20,
    "deleted_message":      20,
    "risky_app_high":       35,
    "risky_app_medium":     20,
    "risky_site_high":      35,
    "risky_site_medium":    20,
    "geofence_exit":        25,
    "night_use":            15,
    "content_high":         50,
    "content_medium":       30,
    "content_low":          10,
}


def set_config(config: NotificationConfig):
    _configs[config.profile_id] = config


def get_config(profile_id: str) -> Optional[NotificationConfig]:
    return _configs.get(profile_id)


def record_event(profile_id: str, event_type: str, description: str,
                 score: int, data: Optional[dict] = None):
    event = RiskEvent(
        profile_id=profile_id,
        event_type=event_type,
        description=description,
        score=score,
        timestamp=datetime.now(timezone.utc),
        data=data,
    )
    _events.setdefault(profile_id, []).append(event)


def process_messages(profile_id: str, messages: list[WhatsAppMessage]):
    """WhatsApp mesajlarından risk olayları üretir."""
    for msg in messages:
        if msg.is_deleted and msg.has_media:
            record_event(profile_id, "deleted_with_media",
                f"Medya içeren mesaj silindi — {msg.chat_name}",
                _SCORE_TABLE["deleted_with_media"],
                {"chat": msg.chat_name, "timestamp": str(msg.timestamp)})

        elif msg.is_deleted and msg.is_from_me:
            record_event(profile_id, "self_deleted",
                f"Kendi gönderdiği mesajı sildi — {msg.chat_name}",
                _SCORE_TABLE["self_deleted"],
                {"chat": msg.chat_name})

        elif msg.is_deleted:
            record_event(profile_id, "deleted_by_other",
                f"Karşı taraf mesajı sildi — {msg.chat_name}",
                _SCORE_TABLE["deleted_by_other"],
                {"chat": msg.chat_name})

        if msg.risk_level == "high":
            record_event(profile_id, "content_high",
                f"Yüksek riskli içerik — {msg.chat_name}",
                _SCORE_TABLE["content_high"],
                {"categories": msg.risk_categories})
        elif msg.risk_level == "medium":
            record_event(profile_id, "content_medium",
                f"Orta riskli içerik — {msg.chat_name}",
                _SCORE_TABLE["content_medium"],
                {"categories": msg.risk_categories})
        elif msg.risk_level == "low":
            record_event(profile_id, "content_low",
                f"Düşük riskli içerik — {msg.chat_name}",
                _SCORE_TABLE["content_low"],
                {"categories": msg.risk_categories})


def process_apps(profile_id: str, apps: list[InstalledApp]):
    """Riskli uygulamalardan risk olayları üretir."""
    for app in apps:
        if app.risk_level == "high":
            record_event(profile_id, "risky_app_high",
                f"Yüksek riskli uygulama: {app.display_name}",
                _SCORE_TABLE["risky_app_high"],
                {"app": app.display_name, "category": app.category})
        elif app.risk_level == "medium":
            record_event(profile_id, "risky_app_medium",
                f"Orta riskli uygulama: {app.display_name}",
                _SCORE_TABLE["risky_app_medium"],
                {"app": app.display_name, "category": app.category})


def process_browser(profile_id: str, items: list[BrowserHistoryItem]):
    """Tarayıcı geçmişinden risk olayları üretir."""
    for item in items:
        if item.risk_level == "high":
            record_event(profile_id, "risky_site_high",
                f"Riskli site ziyareti: {item.url[:60]}",
                _SCORE_TABLE["risky_site_high"],
                {"url": item.url, "category": item.risk_category})
        elif item.risk_level == "medium":
            record_event(profile_id, "risky_site_medium",
                f"Orta riskli site: {item.url[:60]}",
                _SCORE_TABLE["risky_site_medium"],
                {"url": item.url})


def process_geofence(profile_id: str, alerts: list[GeofenceAlert]):
    """Geofence çıkışlarından risk olayları üretir."""
    for alert in alerts:
        if alert.event == "exited":
            record_event(profile_id, "geofence_exit",
                f"Güvenli bölgeden çıkış: {alert.zone_name}",
                _SCORE_TABLE["geofence_exit"],
                {"zone": alert.zone_name})


def check_night_use(profile_id: str, messages: list[WhatsAppMessage]):
    """Gece saatlerinde WhatsApp kullanımını tespit eder."""
    config = _configs.get(profile_id)
    if not config: return
    try:
        night_start = int(config.night_mode_start.split(":")[0])
        night_end = int(config.night_mode_end.split(":")[0])
    except Exception:
        return
    for msg in messages:
        hour = msg.timestamp.hour
        if night_start > night_end:
            # gece yarısı geçen aralık: 23:00 – 07:00
            is_night = hour >= night_start or hour < night_end
        else:
            # aynı gün içinde kalan aralık: 00:00 – 06:00
            is_night = night_start <= hour < night_end
        if is_night:
            record_event(profile_id, "night_use",
                f"Gece saatinde mesajlaşma ({msg.timestamp.strftime('%H:%M')})",
                _SCORE_TABLE["night_use"],
                {"hour": hour, "chat": msg.chat_name})
            break  # Günde bir kez kaydet


def generate_daily_report(profile_id: str) -> DailyRiskReport:
    """Bugünkü risk raporunu üretir."""
    today = date.today().isoformat()
    today_events = [
        e for e in _events.get(profile_id, [])
        if e.timestamp.date().isoformat() == today
    ]
    total_score = min(sum(e.score for e in today_events), 100)

    if total_score == 0:
        risk_level = "none"
    elif total_score < 30:
        risk_level = "low"
    elif total_score < 60:
        risk_level = "medium"
    elif total_score < 85:
        risk_level = "high"
    else:
        risk_level = "critical"

    return DailyRiskReport(
        profile_id=profile_id,
        date=today,
        total_score=total_score,
        risk_level=risk_level,
        events=today_events,
        deleted_message_count=sum(1 for e in today_events if "deleted" in e.event_type),
        risky_app_count=sum(1 for e in today_events if "risky_app" in e.event_type),
        risky_site_count=sum(1 for e in today_events if "risky_site" in e.event_type),
        geofence_exit_count=sum(1 for e in today_events if e.event_type == "geofence_exit"),
    )


def get_all_events(profile_id: str, limit: int = 100) -> list[RiskEvent]:
    return _events.get(profile_id, [])[-limit:]


def analyze_text(text: str):
    """Metin üzerinde risk analizi yapar; (risk_level_str, categories) döner."""
    from .content_filter import classify_risk
    level, cats = classify_risk(text)
    return level.value, cats


def detect_anomalies(profile_id: str) -> list[dict]:
    """Scan stored data for behavioral anomalies; return findings list."""
    anomalies = []
    now = datetime.now(timezone.utc)
    today_str = now.date().isoformat()

    messages = db_service.get_message_history(profile_id, limit=2000)

    def parse_ts(ts_str: str):
        try:
            return datetime.fromisoformat(str(ts_str).replace("Z", "+00:00"))
        except Exception:
            return None

    if messages:
        NIGHT_HOURS = set(range(23, 24)) | set(range(0, 6))

        # ── 1. Night usage spike ──────────────────────────────────────
        night_today = [
            m for m in messages
            if (ts := parse_ts(m.get("timestamp")))
            and ts.date().isoformat() == today_str
            and ts.hour in NIGHT_HOURS
        ]
        if len(night_today) >= 10:
            anomalies.append({
                "type": "anomaly",
                "severity": "high" if len(night_today) >= 20 else "medium",
                "title": "Gece Kullanim Artisi",
                "description": f"Gece saatinde {len(night_today)} mesaj gonderildi/alindi",
                "detected_at": now.isoformat(),
                "data": {"count": len(night_today)},
            })

        # ── 2. Message volume spike ───────────────────────────────────
        today_msgs = [m for m in messages if str(m.get("timestamp", ""))[:10] == today_str]
        daily_counts: dict[str, int] = defaultdict(int)
        for m in messages:
            day = str(m.get("timestamp", ""))[:10]
            if day and day != today_str:
                daily_counts[day] += 1

        if len(daily_counts) >= 3:
            avg = sum(daily_counts.values()) / len(daily_counts)
            today_count = len(today_msgs)
            if avg > 0 and today_count > avg * 3 and today_count > 20:
                anomalies.append({
                    "type": "anomaly",
                    "severity": "high",
                    "title": "Mesaj Hacmi Artisi",
                    "description": f"Bugun {today_count} mesaj (ort. {avg:.0f}) — {today_count / avg:.1f}x artis",
                    "detected_at": now.isoformat(),
                    "data": {"today": today_count, "avg": round(avg, 1)},
                })

        # ── 3. New contact (not seen in prior 7 days) ─────────────────
        cutoff = (now - timedelta(days=7)).isoformat()
        recent = (now - timedelta(hours=24)).isoformat()
        old_senders = {
            m.get("sender", "").strip()
            for m in messages
            if str(m.get("timestamp", "")) < cutoff and m.get("sender", "").strip()
        }
        new_senders = {
            m.get("sender", "").strip()
            for m in messages
            if str(m.get("timestamp", "")) >= recent and m.get("sender", "").strip()
        }
        truly_new = new_senders - old_senders
        if truly_new:
            preview = ", ".join(list(truly_new)[:3])
            anomalies.append({
                "type": "anomaly",
                "severity": "medium",
                "title": "Yeni Kontak Tespit Edildi",
                "description": f"Son 24 saatte {len(truly_new)} yeni kontak: {preview}",
                "detected_at": now.isoformat(),
                "data": {"contacts": list(truly_new)[:10]},
            })

        # ── 4. Burst messaging (≥20 msgs within 1 hour) ───────────────
        hourly: dict[str, int] = defaultdict(int)
        for m in today_msgs:
            ts = parse_ts(m.get("timestamp"))
            if ts:
                hourly[ts.strftime("%Y-%m-%dT%H")] += 1
        for hour_key, cnt in hourly.items():
            if cnt >= 20:
                anomalies.append({
                    "type": "anomaly",
                    "severity": "medium",
                    "title": "Yogun Mesajlasma",
                    "description": f"1 saat icinde {cnt} mesaj ({hour_key[11:13]}:00-{hour_key[11:13]}:59)",
                    "detected_at": now.isoformat(),
                    "data": {"hour": hour_key, "count": cnt},
                })
                break

    # ── 5. Open Wi-Fi today ───────────────────────────────────────────
    flagged = db_service.get_flagged_wifi(profile_id, limit=20)
    open_today = [
        w for w in flagged
        if str(w.get("connected_at", ""))[:10] == today_str and w.get("is_open")
    ]
    if open_today:
        ssids = ", ".join(w["ssid"] for w in open_today[:3])
        anomalies.append({
            "type": "anomaly",
            "severity": "medium",
            "title": "Acik WiFi Baglantisi",
            "description": f"Sifresiz ag kullanildi: {ssids}",
            "detected_at": now.isoformat(),
            "data": {"networks": [w["ssid"] for w in open_today]},
        })

    return anomalies
