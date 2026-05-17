"""
Ebeveyn Bildirim Servisi
E-posta ile uyarı gönderir. SMTP tabanlı, harici servis gerektirmez.
"""
import asyncio
import smtplib
import os
import html
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import httpx
from .models import DailyRiskReport, GeofenceAlert, NotificationConfig


def _smtp_cfg():
    return {
        "host": os.getenv("SMTP_HOST", "smtp.gmail.com"),
        "port": int(os.getenv("SMTP_PORT", "587")),
        "user": os.getenv("SMTP_USER", ""),
        "password": os.getenv("SMTP_PASS", ""),
        "from": os.getenv("FROM_EMAIL") or os.getenv("SMTP_USER", ""),
    }


async def _send_email(to: str, subject: str, body_html: str) -> bool:
    cfg = _smtp_cfg()
    if not cfg["user"] or not cfg["password"]:
        print(f"[BİLDİRİM] {subject}")
        return False

    def _blocking() -> bool:
        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = cfg["from"]
            msg["To"] = to
            msg.attach(MIMEText(body_html, "html", "utf-8"))
            with smtplib.SMTP(cfg["host"], cfg["port"]) as server:
                server.starttls()
                server.login(cfg["user"], cfg["password"])
                server.sendmail(cfg["from"], to, msg.as_string())
            return True
        except Exception as e:
            print(f"[BİLDİRİM HATASI] {e}")
            return False

    return await asyncio.to_thread(_blocking)


async def _send_telegram(text: str) -> bool:
    token = os.getenv("TELEGRAM_BOT_TOKEN", "")
    chat_id = os.getenv("TELEGRAM_CHAT_ID", "")
    if not token or not chat_id:
        return False
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(
                f"https://api.telegram.org/bot{token}/sendMessage",
                json={"chat_id": chat_id, "text": text, "parse_mode": "HTML"},
            )
        return r.status_code == 200
    except Exception as e:
        print(f"[TELEGRAM HATASI] {e}")
        return False


async def notify_high_risk(config: NotificationConfig, report: DailyRiskReport, profile_name: str) -> bool:
    """Günlük risk skoru eşiği aşıldığında bildirim gönderir."""
    if not config.email:
        return False
    if report.total_score < config.notify_on_score_above:
        return False

    risk_emoji = {"none": "✅", "low": "🟡", "medium": "🟠", "high": "🔴", "critical": "🚨"}.get(report.risk_level, "⚠️")
    subject = f"{risk_emoji} Aile Güvenliği — {profile_name} Risk Uyarısı ({report.date})"

    events_html = "".join(
        f"<li><b>{html.escape(e.event_type)}</b>: {html.escape(e.description)} (+{e.score} puan)</li>"
        for e in report.events
    )

    body = f"""
    <html><body style="font-family:sans-serif;padding:20px">
    <h2>{risk_emoji} {html.escape(profile_name)} — Günlük Risk Raporu</h2>
    <table style="border-collapse:collapse">
      <tr><td><b>Tarih:</b></td><td>{report.date}</td></tr>
      <tr><td><b>Risk Skoru:</b></td><td><span style="color:red;font-size:1.4em">{report.total_score}/100</span></td></tr>
      <tr><td><b>Risk Seviyesi:</b></td><td>{report.risk_level.upper()}</td></tr>
      <tr><td><b>Silinen Mesaj:</b></td><td>{report.deleted_message_count}</td></tr>
      <tr><td><b>Riskli Uygulama:</b></td><td>{report.risky_app_count}</td></tr>
      <tr><td><b>Riskli Site:</b></td><td>{report.risky_site_count}</td></tr>
      <tr><td><b>Bölge Dışı Çıkış:</b></td><td>{report.geofence_exit_count}</td></tr>
    </table>
    <h3>Olaylar</h3>
    <ul>{events_html}</ul>
    <hr>
    <small>Bu e-posta Aile Güvenliği Paneli tarafından otomatik olarak gönderilmiştir.</small>
    </body></html>
    """
    tg_text = (
        f"{risk_emoji} <b>{html.escape(profile_name)}</b> — Risk Skoru: {report.total_score}/100\n"
        f"Seviye: {report.risk_level.upper()} | Tarih: {report.date}"
    )
    results = await asyncio.gather(
        _send_email(config.email, subject, body) if config.email else asyncio.sleep(0),
        _send_telegram(tg_text),
    )
    return any(results)


async def notify_geofence_exit(config: NotificationConfig, alert: GeofenceAlert, profile_name: str) -> bool:
    """Güvenli bölgeden çıkışta anlık bildirim gönderir."""
    if not config.email or not config.notify_on_geofence_exit:
        return False
    subject = f"🚨 {html.escape(profile_name)} güvenli bölgeden çıktı: {html.escape(alert.zone_name)}"
    body = f"""
    <html><body style="font-family:sans-serif;padding:20px">
    <h2>🚨 Bölge Uyarısı</h2>
    <p><b>{html.escape(profile_name)}</b>, <b>{html.escape(alert.zone_name)}</b> bölgesinden çıktı.</p>
    <p><b>Zaman:</b> {alert.timestamp.strftime('%d.%m.%Y %H:%M')}</p>
    <p><b>Konum:</b> {alert.latitude:.5f}, {alert.longitude:.5f}</p>
    <p><a href="https://maps.google.com/?q={alert.latitude},{alert.longitude}">Google Maps'te Gör</a></p>
    </body></html>
    """
    tg_text = (
        f"🚨 <b>{html.escape(profile_name)}</b> güvenli bölgeden çıktı!\n"
        f"Bölge: {html.escape(alert.zone_name)}\n"
        f"Konum: {alert.latitude:.5f}, {alert.longitude:.5f}\n"
        f"Zaman: {alert.timestamp.strftime('%d.%m.%Y %H:%M')}"
    )
    results = await asyncio.gather(
        _send_email(config.email, subject, body) if config.email else asyncio.sleep(0),
        _send_telegram(tg_text),
    )
    return any(results)


async def notify_deleted_message(config: NotificationConfig, profile_name: str, chat_name: str) -> bool:
    """Silinen mesaj tespitinde bildirim gönderir."""
    if not config.email or not config.notify_on_deleted_message:
        return False
    subject = f"⚠️ {html.escape(profile_name)} — Silinen mesaj tespit edildi"
    body = f"""
    <html><body style="font-family:sans-serif;padding:20px">
    <h2>⚠️ Silinen Mesaj Uyarısı</h2>
    <p><b>{html.escape(profile_name)}</b> adlı profilde <b>{html.escape(chat_name)}</b> sohbetinde silinen mesaj tespit edildi.</p>
    <p>Dashboard'u kontrol edin.</p>
    </body></html>
    """
    tg_text = (
        f"⚠️ <b>{html.escape(profile_name)}</b> — Silinen mesaj tespit edildi!\n"
        f"Sohbet: {html.escape(chat_name)}"
    )
    results = await asyncio.gather(
        _send_email(config.email, subject, body) if config.email else asyncio.sleep(0),
        _send_telegram(tg_text),
    )
    return any(results)
