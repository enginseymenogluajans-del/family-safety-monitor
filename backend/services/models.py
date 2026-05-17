from pydantic import BaseModel, SecretStr, field_validator
from typing import Optional, List, Literal
from datetime import datetime
import re

# content_filter.RiskLevel (str Enum) ile uyumlu: her ikisi de aynı string değerleri taşır
RiskLevel = Literal["none", "low", "medium", "high", "critical"]


# ─────────────────────────────────────────
# MEVCUT MODELLER (genişletildi)
# ─────────────────────────────────────────

class LocationData(BaseModel):
    profile_id: str
    latitude: float
    longitude: float
    accuracy: Optional[float] = None
    timestamp: datetime
    device_name: str = ""
    battery_level: Optional[float] = None
    in_safe_zone: Optional[bool] = None
    zone_name: Optional[str] = None


class PhotoItem(BaseModel):
    profile_id: str
    filename: str
    created: Optional[datetime] = None
    size: Optional[int] = None
    download_url: str


class DriveItem(BaseModel):
    name: str
    type: str
    size: Optional[int] = None
    modified: Optional[datetime] = None
    path: str


class EmailItem(BaseModel):
    profile_id: str
    message_id: str
    subject: str
    sender: str
    snippet: str
    date: Optional[datetime] = None
    is_read: bool = True


class WhatsAppMessage(BaseModel):
    profile_id: str
    chat_name: str
    sender: str
    text: str
    timestamp: datetime
    is_redacted: bool = False
    risk_level: RiskLevel = "none"
    risk_categories: List[str] = []
    # YENİ: silinen mesaj alanları
    is_deleted: bool = False
    has_media: bool = False
    message_type: Optional[int] = None
    is_from_me: bool = False
    media_url: Optional[str] = None
    risk_score: int = 0


class Profile(BaseModel):
    id: str
    name: str
    apple_id: str
    has_gmail: bool = False
    connected: bool = False
    requires_2fa: bool = False
    daily_risk_score: int = 0


class ProfileStatus(BaseModel):
    profile_id: str
    connected: bool
    requires_2fa: bool
    last_sync: Optional[datetime] = None
    error: Optional[str] = None


class AddProfileRequest(BaseModel):
    profile_id: str
    name: str
    apple_id: str
    password: SecretStr


class TwoFARequest(BaseModel):
    profile_id: str
    code: str


# ─────────────────────────────────────────
# YENİ: UYGULAMA TESPİTİ
# ─────────────────────────────────────────

class InstalledApp(BaseModel):
    profile_id: str
    bundle_id: str
    display_name: str
    category: Literal["dating", "adult", "chat", "social", "gambling", "other"]
    risk_level: RiskLevel = "none"
    detected_via: str
    detected_at: Optional[datetime] = None


# ─────────────────────────────────────────
# YENİ: TARAYICI GEÇMİŞİ
# ─────────────────────────────────────────

class BrowserHistoryItem(BaseModel):
    profile_id: str
    url: str
    title: str
    visit_time: Optional[datetime] = None
    browser: str = "unknown"
    risk_level: RiskLevel = "none"
    risk_category: Optional[str] = None
    visit_count: int = 1


# ─────────────────────────────────────────
# YENİ: GEOFENCİNG
# ─────────────────────────────────────────

class SafeZone(BaseModel):
    zone_id: str
    profile_id: str
    name: str
    latitude: float
    longitude: float
    radius_meters: float = 200.0
    active: bool = True


class GeofenceAlert(BaseModel):
    profile_id: str
    zone_name: str
    event: str          # "exited"|"entered"
    latitude: float
    longitude: float
    timestamp: datetime
    notified: bool = False


# ─────────────────────────────────────────
# YENİ: RİSK SKORU & BİLDİRİM
# ─────────────────────────────────────────

class RiskEvent(BaseModel):
    profile_id: str
    event_type: str     # "deleted_message"|"risky_app"|"risky_site"|"geofence_exit"|"night_use"
    description: str
    score: int
    timestamp: datetime
    data: Optional[dict] = None


class DailyRiskReport(BaseModel):
    profile_id: str
    date: str
    total_score: int
    risk_level: RiskLevel = "none"
    events: List[RiskEvent] = []
    deleted_message_count: int = 0
    risky_app_count: int = 0
    risky_site_count: int = 0
    geofence_exit_count: int = 0
    notified: bool = False


_TIME_RE = re.compile(r'^([01]\d|2[0-3]):[0-5]\d$')

class NotificationConfig(BaseModel):
    profile_id: str
    email: Optional[str] = None
    notify_on_score_above: int = 70
    notify_on_deleted_message: bool = True
    notify_on_geofence_exit: bool = True
    notify_on_risky_app: bool = True
    night_mode_start: str = "23:00"
    night_mode_end: str = "07:00"

    @field_validator("night_mode_start", "night_mode_end")
    @classmethod
    def _validate_time(cls, v: str) -> str:
        if not _TIME_RE.match(v):
            raise ValueError("Zaman HH:MM formatında olmalı (örn. 23:00)")
        return v


class AddZoneRequest(BaseModel):
    name: str
    latitude: float
    longitude: float
    radius_meters: float = 200.0


class NotificationConfigRequest(BaseModel):
    email: Optional[str] = None
    notify_on_score_above: int = 70
    notify_on_deleted_message: bool = True
    notify_on_geofence_exit: bool = True
    notify_on_risky_app: bool = True
    night_mode_start: str = "23:00"
    night_mode_end: str = "07:00"

    @field_validator("night_mode_start", "night_mode_end")
    @classmethod
    def _validate_time(cls, v: str) -> str:
        if not _TIME_RE.match(v):
            raise ValueError("Zaman HH:MM formatında olmalı (örn. 23:00)")
        return v


# ─────────────────────────────────────────
# YENİ: YEREL BACKUP
# ─────────────────────────────────────────

class SMSMessage(BaseModel):
    profile_id: str
    sender: str
    text: str
    timestamp: datetime
    is_read: bool = True
    is_from_me: bool = False
    is_redacted: bool = False
    risk_level: RiskLevel = "none"
    risk_categories: List[str] = []


class CallRecord(BaseModel):
    profile_id: str
    phone_number: str
    duration: int = 0          # saniye
    timestamp: datetime
    call_type: str             # "incoming" | "outgoing" | "missed"


class LocalBackupRequest(BaseModel):
    profile_id: str
    backup_path: str
    passphrase: Optional[str] = None
