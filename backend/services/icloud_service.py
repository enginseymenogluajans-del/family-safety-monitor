from __future__ import annotations
import os
import sqlite3
import tempfile
import time
import traceback
import requests
from datetime import datetime, timezone
from typing import Optional
from pyicloud import PyiCloudService
from pyicloud.exceptions import PyiCloudFailedLoginException, PyiCloudAPIResponseException

_BROWSER_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) "
    "Version/17.4 Safari/605.1.15"
)

from .models import LocationData, PhotoItem, DriveItem, WhatsAppMessage, ProfileStatus
from .content_filter import analyze_whatsapp_message, is_card_image

_sessions: dict[str, PyiCloudService] = {}


def _get_session(profile_id: str) -> Optional[PyiCloudService]:
    return _sessions.get(profile_id)


def _has_trust_token(apple_id: str, cookie_dir: str) -> bool:
    """Check whether a cached trust token exists for this Apple ID."""
    import json, re
    safe_id = re.sub(r"\W", "", apple_id)
    session_file = os.path.join(cookie_dir, f"{safe_id}.session")
    try:
        with open(session_file, encoding="utf-8") as f:
            data = json.load(f)
        return bool(data.get("trust_token"))
    except Exception:
        return False


def connect(profile_id: str, apple_id: str, password: str, _sleep_fn=None) -> ProfileStatus:
    """Connect to iCloud. Pass _sleep_fn=lambda s: None in tests to skip retry delays."""
    _sleep = _sleep_fn if _sleep_fn is not None else time.sleep
    cookie_dir = os.getenv("ICLOUD_COOKIE_DIR", "../credentials")

    has_token = _has_trust_token(apple_id, cookie_dir)
    if has_token:
        print(f"[iCLOUD] Trust token bulundu ({cookie_dir}) — yeniden kimlik doğrulama atlanıyor.")
    else:
        print(f"[iCLOUD] Trust token yok — tam kimlik doğrulama başlatılıyor.")

    retry_delays = [30, 60]  # sleep between retries only, not before first attempt
    last_error = ""
    for attempt in range(3):
        _orig_ua = requests.utils.default_user_agent
        requests.utils.default_user_agent = lambda *_: _BROWSER_UA
        try:
            api = PyiCloudService(apple_id, password, cookie_directory=cookie_dir)
            _sessions[profile_id] = api
            if api.requires_2fa:
                return ProfileStatus(profile_id=profile_id, connected=False, requires_2fa=True, error="2FA kodu gerekli")
            print(f"[iCLOUD] Giriş başarılı. Trust token önbelleğe alındı: {cookie_dir}")
            return ProfileStatus(profile_id=profile_id, connected=True, requires_2fa=False, last_sync=datetime.now(timezone.utc))
        except PyiCloudFailedLoginException as e:
            print(f"[iCLOUD LOGIN FAILED] apple_id={apple_id}")
            traceback.print_exc()
            return ProfileStatus(profile_id=profile_id, connected=False, requires_2fa=False, error=f"Giriş başarısız: {e}")
        except PyiCloudAPIResponseException as e:
            last_error = str(e)
            print(f"[iCLOUD 503] Deneme {attempt + 1}/3 — {last_error}")
            if attempt < len(retry_delays):
                _sleep(retry_delays[attempt])
        except Exception as e:
            print(f"[iCLOUD ERROR] apple_id={apple_id}")
            traceback.print_exc()
            return ProfileStatus(profile_id=profile_id, connected=False, requires_2fa=False, error=str(e))
        finally:
            requests.utils.default_user_agent = _orig_ua

    # iCloud ulaşılamıyor — yerel backup ile devam edilebilir
    return ProfileStatus(
        profile_id=profile_id,
        connected=False,
        requires_2fa=False,
        error=(
            f"Apple sunucuları yanıt vermiyor (503). "
            f"iCloud bağlantısı şu an mümkün değil. "
            f"Yerel iTunes/Finder backup kullanmak için 'Yerel Backup Bağla' seçeneğini deneyin. "
            f"Teknik detay: {last_error}"
        ),
    )


def verify_2fa(profile_id: str, code: str) -> ProfileStatus:
    api = _get_session(profile_id)
    if not api:
        return ProfileStatus(profile_id=profile_id, connected=False, requires_2fa=False, error="Oturum bulunamadı")
    result = api.validate_2fa_code(code)
    if result:
        return ProfileStatus(profile_id=profile_id, connected=True, requires_2fa=False, last_sync=datetime.now(timezone.utc))
    return ProfileStatus(profile_id=profile_id, connected=False, requires_2fa=True, error="Geçersiz 2FA kodu")


def get_location(profile_id: str) -> Optional[LocationData]:
    api = _get_session(profile_id)
    if not api: return None
    try:
        for device in api.devices:
            status = device.status()
            location = status.get("location")
            if not location: continue
            ts = location.get("timeStamp", 0)
            timestamp = datetime.fromtimestamp(ts / 1000, tz=timezone.utc) if ts else datetime.now(timezone.utc)
            return LocationData(
                profile_id=profile_id,
                latitude=location["latitude"], longitude=location["longitude"],
                accuracy=location.get("horizontalAccuracy"), timestamp=timestamp,
                device_name=status.get("name", "iPhone"), battery_level=status.get("batteryLevel")
            )
    except Exception:
        return None


def get_photos(profile_id: str, limit: int = 30) -> list[PhotoItem]:
    api = _get_session(profile_id)
    if not api: return []
    items = []
    try:
        library = api.photos.libraries.get("PrimarySync") or api.photos.all
        for photo in list(library)[:limit]:
            filename = getattr(photo, "filename", "photo.jpg")
            if is_card_image(filename): continue
            items.append(PhotoItem(
                profile_id=profile_id, filename=filename,
                created=getattr(photo, "created", None), size=getattr(photo, "size", None),
                download_url=f"/api/photo-download/{profile_id}/{photo.id}"
            ))
    except Exception:
        pass
    return items


def get_drive_items(profile_id: str, path: str = "/") -> list[DriveItem]:
    api = _get_session(profile_id)
    if not api: return []
    items = []
    try:
        node = api.drive.root if path == "/" else api.drive[path]
        for child in node.dir():
            item = node[child]
            items.append(DriveItem(
                name=child, type="folder" if item.type == "folder" else "file",
                size=getattr(item, "size", None), modified=getattr(item, "date_modified", None),
                path=f"{path}/{child}".replace("//", "/")
            ))
    except Exception:
        pass
    return items


def get_whatsapp_messages(profile_id: str, limit: int = 100) -> list[WhatsAppMessage]:
    api = _get_session(profile_id)
    if not api: return []
    messages = []
    try:
        try:
            wa_node = api.drive["WhatsApp"]
            db_file = wa_node["ChatStorage.sqlite"]
            with tempfile.TemporaryDirectory() as tmpdir:
                db_path = os.path.join(tmpdir, "ChatStorage.sqlite")
                db_file.open(stream=True).raw.save(db_path)

                # WAL ve SHM dosyalarını da indir
                for ext in ["-wal", "-shm"]:
                    try:
                        wal_file = wa_node[f"ChatStorage.sqlite{ext}"]
                        wal_file.open(stream=True).raw.save(db_path + ext)
                    except (KeyError, AttributeError):
                        pass

                messages = _parse_whatsapp_db(profile_id, db_path, limit)
        except (KeyError, AttributeError):
            messages = []
    except Exception:
        pass
    return messages


def _open_db_with_wal(db_path: str) -> sqlite3.Connection:
    """WAL checkpoint yaparak bekleyen tüm yazmaları ana DB'ye işler."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    except Exception:
        pass
    return conn


def _detect_schema_columns(conn: sqlite3.Connection) -> dict:
    """ZWAMESSAGE tablosunda hangi opsiyonel sütunların var olduğunu kontrol eder."""
    cursor = conn.execute("PRAGMA table_info(ZWAMESSAGE)")
    cols = {row[1] for row in cursor.fetchall()}
    return {
        "has_revoked":  "ZREVOKED"  in cols,   # iOS 16+ "Herkesten Sil" bayrağı
        "has_flagged":  "ZFLAGGED"  in cols,   # yıldızlı/önemli işareti
        "has_stanzaid": "ZSTANZAID" in cols,   # mesaj kimliği (tekrar tespiti için)
    }


def _parse_whatsapp_db(profile_id: str, db_path: str, limit: int) -> list[WhatsAppMessage]:
    """
    WhatsApp SQLite DB'sini okur.

    Silme tespiti (üç katmanlı):
      1. ZDELETED = 1         — tüm sürümlerde temel bayrak
      2. ZREVOKED = 1         — iOS 16+ "Herkesten Sil" (unsend) bayrağı
      3. ZMESSAGETYPE IN (6,7)— tip kodu: 6=silindi(alıcı), 7=herkesten silindi

    Ek iyileştirmeler:
      - Grup sohbetlerinde ZFROMJID kişi adı olarak kullanılır
      - ZFLAGGED mesajlar her zaman dahil edilir
      - Medya tespiti: ZMESSAGETYPE 1-5,8,9 AND metin yok → medya mesajı
      - Schema farklılıklarına karşı PRAGMA table_info koruması
      - WAL checkpoint TRUNCATE modunda uygulanır
    """
    messages = []
    try:
        conn = _open_db_with_wal(db_path)
        schema = _detect_schema_columns(conn)

        # Dinamik SELECT: opsiyonel sütunlar yoksa sabit 0 döndür
        revoked_col = "COALESCE(m.ZREVOKED, 0)"   if schema["has_revoked"]  else "0"
        flagged_col = "COALESCE(m.ZFLAGGED, 0)"   if schema["has_flagged"]  else "0"

        query = f"""
            SELECT
                COALESCE(cs.ZPARTNERNAME, cs.ZCONTACTJID, m.ZFROMJID, 'Bilinmeyen') AS chat_name,
                COALESCE(m.ZFROMJID, '')                AS sender_jid,
                m.ZTEXT,
                m.ZMESSAGEDATE,
                COALESCE(m.ZDELETED,  0)                AS zdeleted,
                {revoked_col}                           AS zrevoked,
                COALESCE(m.ZMESSAGETYPE, 0)             AS zmessagetype,
                COALESCE(m.ZISFROMME, 0)                AS zisfromme,
                mi.ZMEDIAURL                            AS zmedia_url,
                mi.ZMEDIALOCALPATH                      AS zmedia_path,
                (mi.Z_PK IS NOT NULL)                   AS zhas_media,
                {flagged_col}                           AS zflagged
            FROM ZWAMESSAGE m
            LEFT JOIN ZWACHATSESSION cs ON m.ZCHATSESSION = cs.Z_PK
            LEFT JOIN ZWAMEDIAITEM   mi ON m.ZMEDIAITEM   = mi.Z_PK
            WHERE (
                m.ZTEXT IS NOT NULL
                OR m.ZDELETED    = 1
                OR m.ZREVOKED    = 1
                OR m.ZMESSAGETYPE IN (6, 7)
                OR mi.Z_PK IS NOT NULL
                OR {flagged_col} = 1
            )
            ORDER BY m.ZMESSAGEDATE DESC
            LIMIT ?
        """

        cursor = conn.execute(query, (limit,))
        level_order = {"none": 0, "low": 1, "medium": 2, "high": 3}
        # Tip kodları: 1=resim, 2=video, 3=ses, 4=kişi, 5=konum,
        #              6=silindi(alıcı), 7=herkesten silindi, 8=gif, 9=sticker
        MEDIA_TYPES = {1, 2, 3, 4, 5, 8, 9}
        DELETED_TYPES = {6, 7}

        for row in cursor.fetchall():
            chat_name  = row["chat_name"]
            sender_jid = row["sender_jid"]
            text       = row["ZTEXT"] or ""
            msg_date   = row["ZMESSAGEDATE"]
            msg_type   = row["zmessagetype"]
            is_from_me = bool(row["zisfromme"])
            has_media  = bool(row["zhas_media"]) or (msg_type in MEDIA_TYPES)
            media_url  = row["zmedia_url"] or row["zmedia_path"]

            # Üç katmanlı silme tespiti
            is_deleted = (
                bool(row["zdeleted"])
                or bool(row["zrevoked"])
                or msg_type in DELETED_TYPES
            )

            # Grup sohbetleri: JID'den telefon numarasını temizle
            if sender_jid and "@" in sender_jid:
                sender_display = sender_jid.split("@")[0]
            else:
                sender_display = sender_jid or ("Ben" if is_from_me else "Bilinmeyen")

            # Anlamlı placeholder
            if not text and is_deleted and has_media:
                text = "[Silindi — medya içeriyordu]"
            elif not text and is_deleted:
                text = "[Silindi — içerik kurtarılamadı]"
            elif not text and has_media:
                text = "[Medya mesajı]"

            filtered_text, was_redacted, risk_level, risk_cats = analyze_whatsapp_message(text)
            current_level = risk_level.value

            # Risk seviyesi kuralları
            if is_deleted and has_media:
                if level_order.get(current_level, 0) < 3:
                    current_level = "high"
                if "deleted_with_media" not in risk_cats:
                    risk_cats.append("deleted_with_media")
            elif is_deleted and is_from_me:
                if level_order.get(current_level, 0) < 3:
                    current_level = "high"
                if "self_deleted" not in risk_cats:
                    risk_cats.append("self_deleted")
            elif is_deleted:
                if level_order.get(current_level, 0) < 2:
                    current_level = "medium"
                if "deleted_by_other" not in risk_cats:
                    risk_cats.append("deleted_by_other")

            # Yıldızlı mesaj ekstra bağlam
            if bool(row["zflagged"]) and "flagged" not in risk_cats:
                risk_cats.append("flagged")

            risk_score = _calc_message_risk_score(is_deleted, has_media, is_from_me, current_level)

            try:
                # WhatsApp Core Data epoch: 1 Ocak 2001 = Unix +978307200
                timestamp = datetime.fromtimestamp(float(msg_date) + 978307200, tz=timezone.utc)
            except Exception:
                timestamp = datetime.now(timezone.utc)

            messages.append(WhatsAppMessage(
                profile_id=profile_id,
                chat_name=chat_name,
                sender=sender_display,
                text=filtered_text,
                timestamp=timestamp,
                is_redacted=was_redacted,
                risk_level=current_level,
                risk_categories=risk_cats,
                is_deleted=is_deleted,
                has_media=has_media,
                message_type=msg_type,
                is_from_me=is_from_me,
                media_url=media_url,
                risk_score=risk_score,
            ))

        conn.close()
    except Exception:
        pass
    return messages


def _calc_message_risk_score(is_deleted: bool, has_media: bool, is_from_me: bool, risk_level: str) -> int:
    score = 0
    level_scores = {"none": 0, "low": 15, "medium": 35, "high": 60}
    score += level_scores.get(risk_level, 0)
    if is_deleted and has_media: score += 30
    elif is_deleted and is_from_me: score += 25
    elif is_deleted: score += 15
    return min(score, 100)


def get_status(profile_id: str) -> ProfileStatus:
    api = _get_session(profile_id)
    if not api:
        return ProfileStatus(profile_id=profile_id, connected=False, requires_2fa=False)
    try:
        list(api.devices)
        return ProfileStatus(profile_id=profile_id, connected=True, requires_2fa=False, last_sync=datetime.now(timezone.utc))
    except Exception as e:
        return ProfileStatus(profile_id=profile_id, connected=False, requires_2fa=False, error=str(e))


def disconnect(profile_id: str) -> None:
    _sessions.pop(profile_id, None)
