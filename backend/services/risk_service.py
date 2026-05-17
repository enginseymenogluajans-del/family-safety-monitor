"""
Risk Skoru & Ebeveyn Bildirimi Servisi
Tüm kaynaklardan gelen olayları birleştirip günlük risk raporu üretir.
"""
import smtplib
import os
from datetime import datetime, timezone, date
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional
from .models import RiskEvent, DailyRiskReport, NotificationConfig

# Bellek içi depolama
_events: dict[str, list[RiskEvent]] = {}          # profil_id → olaylar
_configs: dict[str, NotificationConfig] = {}       # profil_id → bildirim ayarı
_last_score: dict[str, int] = {}                   # profil_id → son skor

# Olay puanları
SCORE_MAP = {
    "deleted_with_media":   40,
    "self_deleted_text":    35,
    "deleted_by_other":     20,
    "risky_message_high":   50,
    "risky_message_medium": 25,
    "risky_message_low":    10,
    "risky_app_high":       45,
    "risky_app_medium":     25,
    "risky_app_low":        10,
    "risky_site_high":      40,
    "risky_site_medium":    20,
    "risky_site_low":       10,
    "geofence_exit":        30,
    "night_use":            15,
}


def record_event(profile_id: str, event_type: str, description: str,
                 score: Optional[int] = None, data: Optional[dict] = None):
    """Yeni bir risk olayı kaydeder."""
    s = score if score is not None else SCORE_MAP.get(event_type, 10)
    event = RiskEvent(
        profile_id=profile_id,
        event_type=event_type,
        description=description,
        score=s,
        timestamp=datetime.now(timezone.utc),
        data=data
    )
    _events.setdefault(profile_id, []).insert(0, event)
    # Son 500 olay sakla
    _events[profile_id] = _events[profile_id][:500]


def get_daily_report(profile_id: str) -> DailyRiskReport:
    """Bugünkü olayları özetleyen risk raporu döner."""
    today = date.today().isoformat()
    events = _events.get(profile_id, [])
    today_events = [e for e in events
                    if e.timestamp.date().isoformat() == today]

    total = sum(e.score for e in today_events)
    total = min(total, 150)  # üst sınır

    deleted_count = sum(1 for e in today_events
                        if "deleted" in e.event_type)
    risky_app_count = sum(1 for e in today_events
                          if "risky_app" in e.event_type)
    risky_site_count = sum(1 for e in today_events
                           if "risky_site" in e.event_type)
    geo_count = sum(1 for e in today_events
                    if e.event_type == "geofence_exit")

    if total == 0:
        level = "none"
    elif total < 30:
        level = "low"
    elif total < 70:
        level = "medium"
    elif total < 100:
        level = "high"
    else:
        level = "critical"

    return DailyRiskReport(
        profile_id=profile_id,
        date=today,
        total_score=total,
        risk_level=level,
        events=today_events,
        deleted_message_count=deleted_count,
        risky_app_count=risky_app_count,
        risky_site_count=risky_site_count,
        geofence_exit_count=geo_count
    )


def set_notification_config(profile_id: str, config: NotificationConfig):
    _configs[profile_id] = config


def get_notification_config(profile_id: str) -> Optional[NotificationConfig]:
    return _configs.get(profile_id)


def maybe_send_notification(profile_id: str, profile_name: str):
    """
    Günlük skoru eşiği geçtiyse ebeveyne e-posta gönderir.
    SMTP ayarları .env dosyasından okunur.
    """
    config = _configs.get(profile_id)
    if not config or not config.email:
        return

    report = get_daily_report(profile_id)
    if report.notified:
        return
    if report.total_score < config.notify_on_score_above:
        return

    _send_email(config.email, profile_name, report)
    report.notified = True


def _send_email(to_email: str, profile_name: str, report: DailyRiskReport):
    smtp_host = os.getenv("SMTP_HOST", "")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_pass = os.getenv("SMTP_PASS", "")

    if not smtp_host or not smtp_user:
        # SMTP ayarı yoksa sadece logla
        print(f"[BİLDİRİM] {profile_name} — Risk skoru: {report.total_score} ({report.risk_level})")
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"⚠️ Aile Güvenliği Uyarısı — {profile_name}"
    msg["From"] = smtp_user
    msg["To"] = to_email

    body = f"""
<h2>⚠️ Aile Güvenliği Paneli — Günlük Rapor</h2>
<p><b>Profil:</b> {profile_name}</p>
<p><b>Tarih:</b> {report.date}</p>
<p><b>Risk Skoru:</b> {report.total_score}/150 — <b>{report.risk_level.upper()}</b></p>
<hr>
<ul>
  <li>Silinen mesaj: {report.deleted_message_count}</li>
  <li>Riskli uygulama: {report.risky_app_count}</li>
  <li>Riskli site: {report.risky_site_count}</li>
  <li>Güvenli bölge ihlali: {report.geofence_exit_count}</li>
</ul>
<p>Detaylar için dashboard'u açın: <a href="http://localhost:8000">http://localhost:8000</a></p>
"""
    msg.attach(MIMEText(body, "html"))

    try:
        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.starttls()
            server.login(smtp_user, smtp_pass)
            server.sendmail(smtp_user, to_email, msg.as_string())
    except Exception as e:
        print(f"[E-POSTA HATASI] {e}")
