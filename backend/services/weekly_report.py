"""
Haftalık Dijital Refah ve Güvenlik Raporu
PDF oluşturur ve SMTP üzerinden ebeveyne gönderir.
"""
import io
import os
from datetime import datetime, timedelta
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import smtplib

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable,
)

SMTP_HOST  = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT  = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER  = os.getenv("SMTP_USER", "")
SMTP_PASS  = os.getenv("SMTP_PASS", "")
FROM_EMAIL = os.getenv("FROM_EMAIL", SMTP_USER)

# ─── Renk sabitleri ──────────────────────────────────────────────────────────
_RED    = colors.HexColor("#dc2626")
_ORANGE = colors.HexColor("#ea580c")
_YELLOW = colors.HexColor("#ca8a04")
_GREEN  = colors.HexColor("#16a34a")
_GRAY   = colors.HexColor("#6b7280")
_DARK   = colors.HexColor("#111827")
_LIGHT  = colors.HexColor("#f9fafb")
_BORDER = colors.HexColor("#e5e7eb")

_RISK_COLOR = {
    "critical": _RED,
    "high":     _RED,
    "medium":   _ORANGE,
    "low":      _YELLOW,
    "none":     _GREEN,
}


def _risk_color(level: str) -> colors.Color:
    return _RISK_COLOR.get(level, _GRAY)


# ─── PDF oluşturucu ──────────────────────────────────────────────────────────

def build_weekly_pdf(
    profile_name: str,
    week_start: datetime,
    week_end: datetime,
    risk_events: list,
    daily_scores: list,       # [{"date": "2026-04-20", "score": 45, "level": "medium"}, ...]
    location_points: list,    # [{"lat": x, "lon": y, "ts": "..."}]
    alerts: list,             # [{"title": "...", "level": "high", "description": "..."}]
    deleted_msg_count: int,
    risky_app_count: int,
    geofence_exit_count: int,
) -> bytes:
    """Haftalık raporu PDF olarak oluşturur; ham byte döndürür."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=2*cm, rightMargin=2*cm,
        topMargin=2*cm, bottomMargin=2*cm,
    )

    styles = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=styles["Heading1"],
                        fontSize=18, textColor=_DARK, spaceAfter=4)
    h2 = ParagraphStyle("h2", parent=styles["Heading2"],
                        fontSize=13, textColor=_DARK, spaceBefore=14, spaceAfter=4)
    normal = ParagraphStyle("normal", parent=styles["Normal"],
                            fontSize=9, textColor=_DARK, leading=13)
    small = ParagraphStyle("small", parent=styles["Normal"],
                           fontSize=8, textColor=_GRAY, leading=12)

    story = []

    # ── Başlık ──────────────────────────────────────────────────────────────
    story.append(Paragraph("Aile Güvenliği Paneli", h1))
    story.append(Paragraph("Haftalık Dijital Refah ve Güvenlik Raporu", h2))
    story.append(Paragraph(
        f"<b>Profil:</b> {profile_name} &nbsp;&nbsp; "
        f"<b>Dönem:</b> {week_start.strftime('%d.%m.%Y')} – {week_end.strftime('%d.%m.%Y')} &nbsp;&nbsp; "
        f"<b>Oluşturulma:</b> {datetime.now().strftime('%d.%m.%Y %H:%M')}",
        normal,
    ))
    story.append(HRFlowable(width="100%", thickness=1, color=_BORDER, spaceAfter=8))

    # ── Özet kutusu ─────────────────────────────────────────────────────────
    avg_score = round(sum(d.get("score", 0) for d in daily_scores) / max(len(daily_scores), 1))
    overall_level = _score_to_level(avg_score)
    level_color = _risk_color(overall_level)

    summary_data = [
        ["Ortalama Risk Skoru", "Silinen Mesaj", "Riskli Uygulama", "Bölge Dışı Çıkış"],
        [
            Paragraph(f'<font color="{level_color.hexcolor()}" size="20"><b>{avg_score}/100</b></font>', normal),
            Paragraph(f'<b>{deleted_msg_count}</b>', normal),
            Paragraph(f'<b>{risky_app_count}</b>', normal),
            Paragraph(f'<b>{geofence_exit_count}</b>', normal),
        ],
    ]
    summary_table = Table(summary_data, colWidths=["25%", "25%", "25%", "25%"])
    summary_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), _DARK),
        ("TEXTCOLOR",  (0, 0), (-1, 0), colors.white),
        ("FONTSIZE",   (0, 0), (-1, 0), 9),
        ("FONTNAME",   (0, 0), (-1, 0), "Helvetica-Bold"),
        ("ALIGN",      (0, 0), (-1, -1), "CENTER"),
        ("VALIGN",     (0, 0), (-1, -1), "MIDDLE"),
        ("ROWBACKGROUNDS", (0, 1), (-1, 1), [_LIGHT]),
        ("BOX",        (0, 0), (-1, -1), 0.5, _BORDER),
        ("INNERGRID",  (0, 0), (-1, -1), 0.25, _BORDER),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(summary_table)
    story.append(Spacer(1, 10))

    # ── Günlük risk tablosu ─────────────────────────────────────────────────
    if daily_scores:
        story.append(Paragraph("Günlük Risk Skorları", h2))
        rows = [["Tarih", "Risk Skoru", "Seviye"]]
        for d in daily_scores:
            lvl = d.get("level", _score_to_level(d.get("score", 0)))
            c = _risk_color(lvl)
            rows.append([
                d.get("date", ""),
                Paragraph(f'<font color="{c.hexcolor()}"><b>{d.get("score", 0)}</b></font>', normal),
                Paragraph(f'<font color="{c.hexcolor()}">{lvl.upper()}</font>', normal),
            ])
        t = Table(rows, colWidths=[5*cm, 5*cm, 5*cm])
        t.setStyle(_base_table_style())
        story.append(t)
        story.append(Spacer(1, 6))

    # ── Aktif uyarılar ───────────────────────────────────────────────────────
    if alerts:
        story.append(Paragraph("Haftalık Güvenlik Uyarıları", h2))
        rows = [["Seviye", "Başlık", "Açıklama", "Kaynak"]]
        for a in alerts:
            lvl = a.get("level", "none")
            c = _risk_color(lvl)
            rows.append([
                Paragraph(f'<font color="{c.hexcolor()}"><b>{lvl.upper()}</b></font>', normal),
                Paragraph(a.get("title", ""), normal),
                Paragraph(a.get("description", ""), small),
                Paragraph(a.get("source", ""), small),
            ])
        t = Table(rows, colWidths=[2.5*cm, 5*cm, 7*cm, 2.5*cm])
        t.setStyle(_base_table_style())
        story.append(t)
        story.append(Spacer(1, 6))

    # ── Risk olayları ────────────────────────────────────────────────────────
    if risk_events:
        story.append(Paragraph("Risk Olayları", h2))
        rows = [["Tarih/Saat", "Olay", "Açıklama", "Puan"]]
        for ev in risk_events[:50]:
            ts = getattr(ev, "timestamp", None)
            ts_str = ts.strftime("%d.%m %H:%M") if hasattr(ts, "strftime") else str(ts)[:16]
            rows.append([
                Paragraph(ts_str, small),
                Paragraph(str(getattr(ev, "event_type", "")), normal),
                Paragraph(str(getattr(ev, "description", ""))[:80], small),
                Paragraph(f'+{getattr(ev, "score", 0)}', normal),
            ])
        t = Table(rows, colWidths=[2.5*cm, 4*cm, 8*cm, 2*cm])
        t.setStyle(_base_table_style())
        story.append(t)
        story.append(Spacer(1, 6))

    # ── Konum özeti ──────────────────────────────────────────────────────────
    if location_points:
        story.append(Paragraph("Konum Geçmişi Özeti", h2))
        story.append(Paragraph(
            f"Bu hafta <b>{len(location_points)}</b> konum noktası kaydedildi.",
            normal,
        ))
        rows = [["Zaman", "Enlem", "Boylam"]]
        for p in location_points[:20]:
            ts = p.get("ts", p.get("timestamp", ""))
            if hasattr(ts, "strftime"):
                ts = ts.strftime("%d.%m %H:%M")
            else:
                ts = str(ts)[:16]
            rows.append([ts, f'{p.get("lat", p.get("latitude", "")):.5f}',
                         f'{p.get("lon", p.get("longitude", "")):.5f}'])
        t = Table(rows, colWidths=[4*cm, 5*cm, 5*cm])
        t.setStyle(_base_table_style())
        story.append(t)
        if len(location_points) > 20:
            story.append(Paragraph(f"… ve {len(location_points)-20} konum daha.", small))

    # ── Dipnot ──────────────────────────────────────────────────────────────
    story.append(Spacer(1, 16))
    story.append(HRFlowable(width="100%", thickness=0.5, color=_BORDER))
    story.append(Spacer(1, 4))
    story.append(Paragraph(
        "Bu rapor Aile Güvenliği Paneli tarafından otomatik oluşturulmuştur. "
        "Tüm veriler yerel sunucuda saklanmaktadır.",
        small,
    ))

    doc.build(story)
    return buf.getvalue()


def _base_table_style() -> TableStyle:
    return TableStyle([
        ("BACKGROUND",    (0, 0), (-1, 0), _DARK),
        ("TEXTCOLOR",     (0, 0), (-1, 0), colors.white),
        ("FONTNAME",      (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",      (0, 0), (-1, 0), 8),
        ("ALIGN",         (0, 0), (-1, -1), "LEFT"),
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
        ("ROWBACKGROUNDS",(0, 1), (-1, -1), [_LIGHT, colors.white]),
        ("BOX",           (0, 0), (-1, -1), 0.5, _BORDER),
        ("INNERGRID",     (0, 0), (-1, -1), 0.25, _BORDER),
        ("TOPPADDING",    (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING",   (0, 0), (-1, -1), 5),
    ])


def _score_to_level(score: int) -> str:
    if score >= 75: return "critical"
    if score >= 50: return "high"
    if score >= 25: return "medium"
    if score >  0:  return "low"
    return "none"


# ─── E-posta gönderici ───────────────────────────────────────────────────────

def send_weekly_report_email(
    to: str,
    profile_name: str,
    week_start: datetime,
    pdf_bytes: bytes,
    avg_score: int,
    alert_count: int,
) -> bool:
    """PDF'i SMTP üzerinden eke koyarak gönderir."""
    subject = (
        f"📊 Haftalık Güvenlik Raporu — {profile_name} "
        f"({week_start.strftime('%d.%m.%Y')})"
    )
    filename = (
        f"guvenlik_raporu_{profile_name.lower().replace(' ','_')}"
        f"_{week_start.strftime('%Y%m%d')}.pdf"
    )

    body_html = f"""
    <html><body style="font-family:sans-serif;padding:20px;color:#111827">
    <h2>📊 {profile_name} — Haftalık Dijital Refah Raporu</h2>
    <p>Dönem: <b>{week_start.strftime('%d.%m.%Y')}</b> – <b>{(week_start + timedelta(days=6)).strftime('%d.%m.%Y')}</b></p>
    <table style="border-collapse:collapse;margin-bottom:16px">
      <tr><td style="padding:6px 12px;background:#111827;color:#fff"><b>Ortalama Risk Skoru</b></td>
          <td style="padding:6px 12px">{avg_score}/100</td></tr>
      <tr><td style="padding:6px 12px;background:#111827;color:#fff"><b>Aktif Uyarı Sayısı</b></td>
          <td style="padding:6px 12px">{alert_count}</td></tr>
    </table>
    <p>Detaylı rapor ek olarak gönderilmiştir.</p>
    <hr>
    <small>Bu e-posta Aile Güvenliği Paneli tarafından otomatik olarak gönderilmiştir.</small>
    </body></html>
    """

    if not SMTP_USER or not SMTP_PASS:
        print(f"[HAFTALIK RAPOR] SMTP yapılandırılmamış. PDF {len(pdf_bytes)} byte.")
        return False

    try:
        msg = MIMEMultipart("mixed")
        msg["Subject"] = subject
        msg["From"]    = FROM_EMAIL
        msg["To"]      = to
        msg.attach(MIMEText(body_html, "html", "utf-8"))
        att = MIMEApplication(pdf_bytes, _subtype="pdf")
        att.add_header("Content-Disposition", "attachment", filename=filename)
        msg.attach(att)
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASS)
            server.sendmail(FROM_EMAIL, to, msg.as_string())
        return True
    except Exception as e:
        print(f"[HAFTALIK RAPOR HATASI] {e}")
        return False
