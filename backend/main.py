from __future__ import annotations
import os
import json
import time
import asyncio
from datetime import datetime, timedelta, timezone
from pathlib import Path
from dotenv import load_dotenv
import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware

from services import icloud_service, gmail_service
from services import app_scanner, browser_history, geo_service, risk_engine, notifier
from services import local_backup_service, db_service
from services import weekly_report as weekly_report_svc
from services import keyword_service, keystroke_archiver, telegram_notifier, restriction_service
from services import supabase_heartbeat
from services import screen_time_service
import socketio
import aiofiles
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from services.models import (
    AddProfileRequest, TwoFARequest,
    Profile, ProfileStatus,
    AddZoneRequest, NotificationConfigRequest, NotificationConfig,
    LocalBackupRequest, LocationData,
)

load_dotenv(Path(__file__).parent / ".env")

# ── API Kimlik Doğrulama ─────────────────────────────────────────────────────

def _ensure_api_key() -> str:
    """API_SECRET_KEY yoksa UUID üretir, .env'e yazar ve konsola yazdırır."""
    import secrets
    key = os.getenv("API_SECRET_KEY", "").strip()
    if not key:
        key = secrets.token_urlsafe(32)
        env_path = Path(__file__).parent / ".env"
        with open(env_path, "a", encoding="utf-8") as f:
            f.write(f"\nAPI_SECRET_KEY={key}\n")
        os.environ["API_SECRET_KEY"] = key
        sep = "=" * 54
        print(f"\n{sep}")
        print("[AUTH] Yeni API anahtarı oluşturuldu ve backend/.env'e kaydedildi.")
        print(f"[AUTH] API_SECRET_KEY={key}")
        print(f"[AUTH] Frontend için frontend-react/.env dosyasına ekleyin:")
        print(f"[AUTH] VITE_API_KEY={key}")
        print(f"{sep}\n")
    return key

API_SECRET_KEY = _ensure_api_key()

# ── Keyring yardımcıları (iCloud şifre güvenli depolama) ────────────────────
_KEYRING_SVC = "family-safety-monitor"

def _kr_set(apple_id: str, password: str) -> None:
    try:
        import keyring
        keyring.set_password(_KEYRING_SVC, apple_id, password)
    except Exception:
        pass

def _kr_get(apple_id: str) -> str | None:
    try:
        import keyring
        return keyring.get_password(_KEYRING_SVC, apple_id)
    except Exception:
        return None

def _kr_del(apple_id: str) -> None:
    try:
        import keyring
        keyring.delete_password(_KEYRING_SVC, apple_id)
    except Exception:
        pass

app = FastAPI(title="Aile Güvenliği Paneli")

# Duplicate keystroke önleme: (profile_id, app_name) → (text, timestamp)
_last_keystroke: dict = {}
app.add_middleware(CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://localhost:3000", "http://localhost:8000", "null", "app://.", "file://", "https://slides-east-euro-sounds.trycloudflare.com", "*"],
    allow_origin_regex=r"https?://192\.168\.\d{1,3}\.\d{1,3}(:\d+)?",
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

# ── API Key Auth Middleware ───────────────────────────────────────────────────
from fastapi import Request
from fastapi.responses import JSONResponse

@app.middleware("http")
async def api_key_middleware(request: Request, call_next):
    """Tüm /api/* rotaları için X-API-Key header kontrolü."""
    if request.method == "OPTIONS":
        return await call_next(request)
    if request.url.path.startswith("/api/"):
        provided = request.headers.get("X-API-Key", "")
        if provided != API_SECRET_KEY:
            return JSONResponse(
                {"detail": "Yetkisiz erişim. X-API-Key header gerekli."},
                status_code=401,
            )
    return await call_next(request)

# Socket.io Altyapısı
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')
socket_app = socketio.ASGIApp(sio, other_asgi_app=app)

# Mobil Cihaz Bağlantı Takibi
_mobile_connections: dict[str, str] = {}  # profile_id -> sid
_live_frames: dict = {}  # profile_id -> {"frame": base64, "ts": float}

db_service.init_db()

_profiles: dict[str, Profile] = {}
_push_tokens: dict[str, list[str]] = {}  # profile_id → [token, ...]
_android_sms: dict[str, list] = {}   # profile_id → [{sender, text, timestamp, ...}]
_android_calls: dict[str, list] = {} # profile_id → [{phone_number, duration, timestamp, direction}]

CREDENTIALS_PATH = os.getenv("GMAIL_CREDENTIALS_PATH", "../credentials/gmail_oauth.json")
TOKEN_DIR        = os.getenv("GMAIL_TOKEN_DIR", "../credentials")
FRONTEND_DIR     = Path(__file__).parent.parent / "frontend"
SCREENSHOTS_DIR  = Path(__file__).parent / "data" / "screenshots"

SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/screenshots", StaticFiles(directory=str(SCREENSHOTS_DIR)), name="screenshots")

# WhatsApp Arşiv Medya Dizini
WA_MEDIA_DIR = Path(__file__).parent.parent / "whatsapp-agent" / "data" / "media"
WA_MEDIA_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/wa-media", StaticFiles(directory=str(WA_MEDIA_DIR)), name="wa-media")


# ── Başlangıç & Bekçi (Sentinel) ───────────────────────────────────────────

async def whatsapp_sentinel():
    """Bağlantı Bekçisi: WhatsApp Agent'ın durumunu 60 saniyede bir kontrol eder."""
    print("[SENTINEL] WhatsApp Bekçisi başlatıldı.")
    last_status = True
    while True:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                r = await client.get("http://localhost:3001/health")
                wa_ok = r.status_code == 200
        except Exception:
            wa_ok = False
        
        if not wa_ok and last_status:
            # Bağlantı yeni koptu!
            print("[SENTINEL] KRİTİK: WhatsApp Agent bağlantısı koptu!")
            msg = "🚨 **DİKKAT:** WhatsApp Takibi DURDU! Bağlantı kesildi, lütfen kontrol edin."
            asyncio.create_task(telegram_notifier.send_telegram_alert(msg))
            for pid in _profiles:
                db_service.save_alert(
                    pid, "wa_disconnect", "high",
                    "WhatsApp Takibi DURDU!",
                    "WhatsApp Agent bağlantısı kesildi. Lütfen sunucuyu ve QR kod bağlantısını kontrol edin.",
                    "System", 1
                )
        elif wa_ok and not last_status:
            # Bağlantı geri geldi
            print("[SENTINEL] BİLGİ: WhatsApp Agent bağlantısı sağlandı.")
            
        last_status = wa_ok
        await asyncio.sleep(60)

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(whatsapp_sentinel())
    # Supabase Heartbeat — Cihaz durumunu Supabase'e periyodik olarak bildir
    asyncio.create_task(supabase_heartbeat.heartbeat_loop("default", interval=30))
    # Mevcut profilleri yükle
    saved_profiles = db_service.load_profiles()
    for p_dict in saved_profiles:
        p = Profile(
            id=p_dict["id"],
            name=p_dict["name"],
            apple_id=p_dict["apple_id"],
            has_gmail=bool(p_dict["has_gmail"]),
            connected=False,
            requires_2fa=bool(p_dict["requires_2fa"]),
            daily_risk_score=p_dict["daily_risk_score"] or 0,
        )
        _profiles[p.id] = p

        # iCloud: keyring'den şifreyi al ve yeniden bağlan
        pwd = _kr_get(p_dict["apple_id"])
        if pwd:
            try:
                status = icloud_service.connect(p.id, p_dict["apple_id"], pwd)
                p.connected = status.connected
                p.requires_2fa = status.requires_2fa
                if status.connected:
                    print(f"[OK] iCloud yeniden bağlandı: {p.name}")
                elif status.requires_2fa:
                    print(f"[2FA] iCloud 2FA gerekli: {p.name}")
            except Exception as exc:
                print(f"[WARN] iCloud yeniden bağlanamadı ({p.name}): {exc}")

        # Local backup: kayıtlı backup_path varsa yeniden bağlan
        bp = p_dict.get("backup_path")
        if bp:
            try:
                result = local_backup_service.connect(p.id, bp)
                if result.get("connected"):
                    print(f"[OK] Yerel backup yeniden bağlandı: {p.name} → {bp}")
                else:
                    print(f"[WARN] Yerel backup bağlanamadı ({p.name}): {result.get('error','?')}")
            except Exception as exc:
                print(f"[WARN] Yerel backup yeniden bağlanamadı ({p.name}): {exc}")

    # First-run: seed a default profile so endpoints don't return 404
    if not _profiles:
        default = Profile(id="default", name="iPhone", apple_id="", has_gmail=False,
                          connected=False, requires_2fa=False, daily_risk_score=0)
        _profiles["default"] = default
        db_service.save_profile(default)
        print("[OK] İlk çalıştırma: varsayılan profil oluşturuldu.")

    print(f"[OK] {len(_profiles)} profil yuklendi.")


# ── Frontend ────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    wa_ok = False
    webrtc_ok = False
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            r = await client.get("http://localhost:3001/health")
            wa_ok = r.status_code == 200
    except Exception:
        pass
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            r = await client.get("http://localhost:8001/api/diagnostics")
            webrtc_ok = r.status_code == 200
    except Exception:
        pass
    icloud_ok = any(p.connected for p in _profiles.values())
    android_ok = len(_mobile_connections) > 0
    return {
        "status": "ok",
        "profiles": len(_profiles),
        "services": {
            "icloud": icloud_ok,
            "whatsapp": wa_ok,
            "android": android_ok,
            "signal_server": webrtc_ok,
        },
    }


# ── Ekran Görüntüsü Yönetimi ──────────────────────────────────────────────────

@app.post("/api/screenshots/take/{profile_id}")
async def command_take_screenshot(profile_id: str):
    sid = _mobile_connections.get(profile_id)
    if not sid:
        raise HTTPException(status_code=404, detail="Cihaz bağlı değil.")
    await sio.emit("take_screenshot", {}, to=sid)
    return {"status": "command_sent"}


class LiveFrameRequest(BaseModel):
    frame: str          # base64 JPEG
    profileId: str = ""


@app.post("/api/screenshot/{profile_id}")
async def post_live_frame(profile_id: str, req: LiveFrameRequest):
    """Android'den gelen canlı ekran karesini bellekte saklar ve yayınlar."""
    _require_profile(profile_id)
    import time as _time
    pid = req.profileId or profile_id
    _live_frames[pid] = {"frame": req.frame, "ts": _time.time()}
    await sio.emit("screen_frame", {"profileId": pid, "frame": req.frame, "ts": int(_time.time() * 1000)})
    return {"ok": True}


@app.get("/api/screenshot/{profile_id}/live")
async def get_live_frame(profile_id: str):
    """Son canlı ekran karesini döndürür (polling fallback)."""
    _require_profile(profile_id)
    data = _live_frames.get(profile_id)
    if not data:
        raise HTTPException(status_code=404, detail="Henüz kare alınmadı")
    return {"frame": data["frame"], "profileId": profile_id, "ts": data["ts"]}


@app.get("/api/audio/{profile_id}/live")
async def get_live_audio(profile_id: str):
    """Son ses chunk'ını döndürür (polling fallback)."""
    data = _live_audio.get(profile_id)
    if not data:
        raise HTTPException(status_code=404, detail="Ses verisi yok")
    return data


from fastapi import UploadFile, File, Form

@app.post("/upload-screenshot")
async def upload_screenshot(profile_id: str = Form(...), image: UploadFile = File(...)):
    filename = f"{profile_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.jpg"
    filepath = SCREENSHOTS_DIR / filename

    content = await image.read()
    async with aiofiles.open(filepath, 'wb') as out_file:
        await out_file.write(content)

    # Supabase Storage'a yükle; başarısız olursa yerel URL kullan
    storage_url = await supabase_heartbeat.upload_screenshot_to_storage(
        profile_id, content, filename
    )
    url = storage_url if storage_url else f"/screenshots/{filename}"

    # Socket.io: canlı frontend'lere bildir
    await sio.emit("new_screenshot", {"profileId": profile_id, "url": url})
    # Supabase live_screenshots tablosuna yaz → Realtime tetikler
    await supabase_heartbeat.push_screenshot(profile_id, url)
    return {"url": url}


@app.get("/api/screenshots/{profile_id}")
async def list_screenshots(profile_id: str, limit: int = 20):
    files = sorted(SCREENSHOTS_DIR.glob(f"{profile_id}_*.jpg"), key=os.path.getmtime, reverse=True)
    result = []
    for f in files[:limit]:
        parts = f.name.replace(".jpg", "").split("_")
        ts_str = f"{parts[1]} {parts[2]}" if len(parts) >= 3 else "Unknown"
        result.append({
            "id": f.name,
            "url": f"/screenshots/{f.name}",
            "timestamp": ts_str,
            "app": "system"
        })
    return result


# ── Socket.io Event Handlers ──────────────────────────────────────────────────

@sio.on("connect")
async def connect(sid, environ):
    query = environ.get("QUERY_STRING", "")
    profile_id = None
    if "profileId=" in query:
        profile_id = query.split("profileId=")[1].split("&")[0]

    if profile_id:
        _mobile_connections[profile_id] = sid
        print(f"[SOCKET] Mobil cihaz bağlandı: {profile_id} (SID: {sid})")
        # Supabase — bağlantı geldiğinde agent_active=True, last_seen güncelle
        asyncio.create_task(supabase_heartbeat.push_heartbeat(profile_id))

@sio.on("disconnect")
async def disconnect(sid):
    for pid, connected_sid in list(_mobile_connections.items()):
        if connected_sid == sid:
            del _mobile_connections[pid]
            # Supabase — bağlantı kesildiğinde agent_active=False
            asyncio.create_task(supabase_heartbeat.push_heartbeat(pid, extra={"agent_active": False}))
            break

@sio.on("screen_frame")
async def handle_screen_frame(sid, data):
    """Android'den gelen ekran karelerini tüm dashboard istemcilerine yayınlar."""
    if isinstance(data, dict):
        pid = data.get("profileId")
        if pid and data.get("frame"):
            import time as _time
            _live_frames[pid] = {"frame": data["frame"], "ts": _time.time()}
    await sio.emit("screen_frame", data)


@sio.on("screen_stream_error")
async def handle_screen_stream_error(sid, data):
    """Android ekran izni yoksa frontend'e hata ilet."""
    await sio.emit("screen_stream_error", data)


@sio.on("request_screen_stream")
async def handle_request_screen_stream(sid, data):
    """Frontend'den gelen akış başlatma isteğini mobil cihaza iletir."""
    pid = data.get("profileId", "default") if isinstance(data, dict) else "default"
    mobile_sid = _mobile_connections.get(pid)
    if mobile_sid:
        await sio.emit("start_screen_stream", {}, to=mobile_sid)


@sio.on("stop_screen_stream")
async def handle_stop_screen_stream(sid, data):
    """Frontend'den gelen akış durdurma isteğini mobil cihaza iletir."""
    pid = data.get("profileId", "default") if isinstance(data, dict) else "default"
    mobile_sid = _mobile_connections.get(pid)
    if mobile_sid:
        await sio.emit("stop_screen_stream", {}, to=mobile_sid)


@sio.on("remote_click")
async def handle_remote_click(sid, data):
    """Ebeveyn dashboard'ından gelen tıklama koordinatını mobil cihaza iletir."""
    pid = data.get("profileId", "default") if isinstance(data, dict) else "default"
    mobile_sid = _mobile_connections.get(pid)
    if mobile_sid:
        await sio.emit("remote_click", data, to=mobile_sid)


@sio.on("camera_frame")
async def handle_camera_frame(sid, data):
    """Android'den gelen kamera karelerini tüm dashboard istemcilerine yayınlar."""
    await sio.emit("camera_frame", data)


_live_audio: dict = {}


@sio.on("audio_frame")
async def handle_audio_frame(sid, data):
    """Android'den gelen ses chunk'larını saklar ve dashboard'a iletir."""
    if isinstance(data, dict):
        pid = data.get("profileId", "default")
        _live_audio[pid] = {
            "chunk": data.get("chunk"),
            "sampleRate": data.get("sampleRate", 16000),
            "ts": data.get("ts"),
        }
    await sio.emit("audio_frame", data)


@sio.on("snapshot")
async def handle_snapshot_event(sid, data):
    """Android'den gelen tek kare snapshot'ı dashboard'a iletir."""
    await sio.emit("snapshot", data)


@sio.on("command")
async def handle_command(sid, data):
    """Dashboard'dan gelen canlı kontrol komutunu Android'e iletir."""
    if not isinstance(data, dict):
        return
    pid = data.get("profileId", "default")
    mobile_sid = _mobile_connections.get(pid)
    if not mobile_sid:
        await sio.emit("command_error", {"error": f"Cihaz bağlı değil: {pid}"}, to=sid)
        return
    cmd_type = data.get("type", "")
    if cmd_type == "screen":
        await sio.emit("start_screen_stream", {}, to=mobile_sid)
    elif cmd_type == "camera":
        await sio.emit("start_camera_stream", {}, to=mobile_sid)
    elif cmd_type == "stop":
        await sio.emit("stop_screen_stream", {}, to=mobile_sid)
        await sio.emit("stop_camera_stream", {}, to=mobile_sid)
        await sio.emit("stop_microphone", {}, to=mobile_sid)
    elif cmd_type == "photo":
        await sio.emit("take_screenshot", {}, to=mobile_sid)
    elif cmd_type == "audio":
        await sio.emit("start_microphone", {}, to=mobile_sid)


@sio.on("register")
async def handle_register(sid, data):
    pid = data.get("profileId")
    if pid:
        _mobile_connections[pid] = sid
        # Android cihaz bilgilerini kaydet
        device_info = {k: v for k, v in data.items() if k != "profileId"}
        if device_info:
            db_service.save_android_device_info(pid, device_info)


@app.get("/", response_class=HTMLResponse)
async def root():
    return (FRONTEND_DIR / "index.html").read_text(encoding="utf-8")


# ── Profil yönetimi ─────────────────────────────────────────────────────────

@app.get("/api/profiles", response_model=list[Profile])
async def list_profiles():
    return list(_profiles.values())


@app.post("/api/auth/icloud", response_model=ProfileStatus)
async def add_icloud_profile(req: AddProfileRequest):
    pwd = req.password.get_secret_value()
    status = await asyncio.to_thread(icloud_service.connect, req.profile_id, req.apple_id, pwd)
    _profiles[req.profile_id] = Profile(
        id=req.profile_id, name=req.name, apple_id=req.apple_id,
        connected=status.connected, requires_2fa=status.requires_2fa
    )
    db_service.save_profile(_profiles[req.profile_id])
    # Şifreyi sistem keyring'ine kaydet (yeniden başlatmada auto-reconnect için)
    _kr_set(req.apple_id, pwd)
    return status


@app.post("/api/auth/2fa", response_model=ProfileStatus)
async def verify_2fa(req: TwoFARequest):
    _require_profile(req.profile_id)
    status = icloud_service.verify_2fa(req.profile_id, req.code)
    _profiles[req.profile_id].connected = status.connected
    _profiles[req.profile_id].requires_2fa = status.requires_2fa
    return status


@app.post("/api/auth/gmail/{profile_id}", response_model=dict)
async def connect_gmail(profile_id: str):
    _require_profile(profile_id)
    creds_path = Path(CREDENTIALS_PATH)
    if not creds_path.exists():
        raise HTTPException(status_code=400, detail=f"Gmail OAuth dosyası bulunamadı: {CREDENTIALS_PATH}")
    success = gmail_service.connect(profile_id, str(creds_path), TOKEN_DIR)
    if success:
        _profiles[profile_id].has_gmail = True
        return {"connected": True}
    raise HTTPException(status_code=500, detail="Gmail bağlantısı kurulamadı")


@app.delete("/api/profiles/{profile_id}")
async def remove_profile(profile_id: str):
    profile = _profiles.get(profile_id)
    icloud_service.disconnect(profile_id)
    gmail_service.disconnect(profile_id)
    local_backup_service.disconnect(profile_id)
    _profiles.pop(profile_id, None)
    _push_tokens.pop(profile_id, None)
    db_service.delete_profile(profile_id)
    # Keyring'den iCloud şifresini sil
    if profile:
        _kr_del(profile.apple_id)
    return {"removed": True}


class PushTokenRequest(BaseModel):
    token: str

@app.post("/api/profiles/{profile_id}/push-token")
async def save_push_token(profile_id: str, req: PushTokenRequest):
    _require_profile(profile_id)
    tokens = _push_tokens.setdefault(profile_id, [])
    if req.token not in tokens:
        tokens.append(req.token)
    return {"ok": True, "token_count": len(tokens)}


@app.post("/api/auth/local-backup", response_model=dict)
async def connect_local_backup(req: LocalBackupRequest):
    _require_profile(req.profile_id)
    result = local_backup_service.connect(req.profile_id, req.backup_path, req.passphrase)
    if result.get("connected"):
        # backup_path'i DB'ye kaydet (yeniden başlatmada auto-reconnect için)
        db_service.save_backup_path(req.profile_id, req.backup_path)
    return result


# ── Mevcut veri endpoint'leri ───────────────────────────────────────────────

@app.get("/api/status/{profile_id}", response_model=ProfileStatus)
async def get_status(profile_id: str):
    _require_profile(profile_id)
    return icloud_service.get_status(profile_id)


@app.get("/api/location/{profile_id}")
async def get_location(profile_id: str):
    _require_profile(profile_id)
    loc = icloud_service.get_location(profile_id)
    if not loc:
        raise HTTPException(status_code=503, detail="Konum alınamadı.")

    # Kalıcı geçmişe kaydet
    db_service.save_location(
        profile_id, loc.latitude, loc.longitude, loc.accuracy,
        loc.device_name or "", loc.battery_level, str(loc.timestamp),
    )

    # Geofence kontrolü
    in_zone, zone_name, new_alerts = geo_service.check_location(profile_id, loc)
    loc.in_safe_zone = in_zone
    loc.zone_name = zone_name

    # Çıkış uyarısı gönder
    cfg = risk_engine.get_config(profile_id)
    if cfg and new_alerts:
        for alert in new_alerts:
            if alert.event == "exited":
                risk_engine.process_geofence(profile_id, [alert])
                asyncio.create_task(notifier.notify_geofence_exit(cfg, alert, _profiles[profile_id].name))

    return loc


class DeviceLocationRequest(BaseModel):
    lat: float
    lng: float
    accuracy: float | None = None
    timestamp: str | None = None


@app.post("/api/location/{profile_id}")
async def post_location(profile_id: str, req: DeviceLocationRequest):
    _require_profile(profile_id)
    ts = req.timestamp or datetime.utcnow().isoformat()
    db_service.save_location(profile_id, req.lat, req.lng, req.accuracy, "device", None, ts)
    loc = LocationData(
        profile_id=profile_id, latitude=req.lat, longitude=req.lng,
        accuracy=req.accuracy, timestamp=ts,
    )
    in_zone, zone_name, new_alerts = geo_service.check_location(profile_id, loc)
    cfg = risk_engine.get_config(profile_id)
    if cfg and new_alerts:
        for alert in new_alerts:
            if alert.event == "exited":
                risk_engine.process_geofence(profile_id, [alert])
                asyncio.create_task(asyncio.to_thread(
                    notifier.notify_geofence_exit, cfg, alert, _profiles[profile_id].name
                ))
    # Supabase Realtime — gps_logs tablosuna anlık konum gönder
    asyncio.create_task(supabase_heartbeat.push_location(
        profile_id, req.lat, req.lng, req.accuracy, ts
    ))
    return {"ok": True, "in_safe_zone": in_zone, "zone_name": zone_name}


@app.get("/api/location_history/{profile_id}")
async def get_location_history(profile_id: str, limit: int = 50):
    """Veritabanına kaydedilmiş geçmiş konum kayıtlarını döndürür."""
    _require_profile(profile_id)
    return db_service.get_location_history(profile_id, limit=limit)


@app.get("/api/photos/archived/{profile_id}")
async def get_archived_photos(profile_id: str, limit: int = 50):
    """WhatsApp Agent tarafından yakalanan (silinenler dahil) medyaları döner."""
    _require_profile(profile_id)
    files = sorted(WA_MEDIA_DIR.glob("*.*"), key=os.path.getmtime, reverse=True)
    result = []
    for f in files[:limit]:
        result.append({
            "id": f.name,
            "filename": f.name,
            "download_url": f"/wa-media/{f.name}",
            "size": f.stat().st_size,
            "created": datetime.fromtimestamp(f.stat().st_mtime).isoformat(),
            "source": "WhatsApp Archive"
        })
    return result


@app.get("/api/photos/{profile_id}")
async def get_photos(profile_id: str, limit: int = 30):
    _require_profile(profile_id)
    return icloud_service.get_photos(profile_id, limit=limit)


@app.get("/api/drive/{profile_id}")
async def get_drive(profile_id: str, path: str = "/"):
    _require_profile(profile_id)
    return icloud_service.get_drive_items(profile_id, path=path)


@app.get("/api/messages/{profile_id}")
async def get_whatsapp(profile_id: str, limit: int = 100):
    _require_profile(profile_id)
    msgs = icloud_service.get_whatsapp_messages(profile_id, limit=limit)
    db_service.save_messages(msgs, source="icloud")
    # Risk motoru güncelle
    risk_engine.process_messages(profile_id, msgs)
    risk_engine.check_night_use(profile_id, msgs)
    # Silinen mesaj bildirimi
    cfg = risk_engine.get_config(profile_id)
    if cfg:
        deleted = [m for m in msgs if m.is_deleted]
        if deleted:
            asyncio.create_task(notifier.notify_deleted_message(cfg, _profiles[profile_id].name, deleted[0].chat_name))
    return msgs


@app.get("/api/messages/{profile_id}/flagged")
async def get_flagged_messages(profile_id: str, limit: int = 200):
    _require_profile(profile_id)
    all_msgs = icloud_service.get_whatsapp_messages(profile_id, limit=limit)
    return [m for m in all_msgs if m.risk_level != "none" or m.is_deleted]


@app.get("/api/emails/{profile_id}")
async def get_emails(profile_id: str, max_results: int = 20):
    _require_profile(profile_id)
    if not gmail_service.is_connected(profile_id):
        raise HTTPException(status_code=400, detail="Gmail bağlantısı yok.")
    return gmail_service.get_emails(profile_id, max_results=max_results)


# ── YENİ: Uygulama tespiti ──────────────────────────────────────────────────

def _get_apps(profile_id: str) -> list:
    """Backup bağlıysa manifest'ten, yoksa iCloud Drive'dan uygulama listesi döner."""
    if local_backup_service.is_connected(profile_id):
        backup_dir = local_backup_service.get_backup_dir(profile_id)
        return app_scanner.scan_from_backup(profile_id, backup_dir)
    api = icloud_service._get_session(profile_id)
    if not api:
        return []
    try:
        return app_scanner.scan_from_drive(profile_id, api.drive.root)
    except Exception:
        return []


@app.get("/api/apps/{profile_id}")
async def get_apps(profile_id: str):
    _require_profile(profile_id)
    apps = _get_apps(profile_id)
    if not apps and not local_backup_service.is_connected(profile_id) and not icloud_service._get_session(profile_id):
        raise HTTPException(status_code=503, detail="iCloud veya yerel backup bağlantısı yok.")
    risk_engine.process_apps(profile_id, apps)
    return apps


@app.get("/api/apps/{profile_id}/flagged")
async def get_flagged_apps(profile_id: str):
    _require_profile(profile_id)
    return app_scanner.get_flagged(_get_apps(profile_id))


# ── SMS & Arama geçmişi ──────────────────────────────────────────────────────

@app.post("/api/android-sms/{profile_id}")
async def receive_android_sms(profile_id: str, request: Request):
    """Android cihazdan SMS listesi al (ContentResolver)."""
    body = await request.json()
    items = body if isinstance(body, list) else []
    _android_sms[profile_id] = items
    return {"stored": len(items)}


@app.post("/api/android-calls/{profile_id}")
async def receive_android_calls(profile_id: str, request: Request):
    """Android cihazdan arama geçmişi al (ContentResolver)."""
    body = await request.json()
    items = body if isinstance(body, list) else []
    _android_calls[profile_id] = items
    return {"stored": len(items)}


@app.get("/api/sms/{profile_id}")
async def get_sms(profile_id: str, limit: int = 200):
    _require_profile(profile_id)
    # Android verisi öncelikli
    if profile_id in _android_sms:
        return _android_sms[profile_id][:limit]
    # iOS backup fallback
    if local_backup_service.is_connected(profile_id):
        return local_backup_service.get_sms_messages(profile_id, limit=limit)
    return []


@app.get("/api/sms/{profile_id}/flagged")
async def get_flagged_sms(profile_id: str, limit: int = 200):
    _require_profile(profile_id)
    if not local_backup_service.is_connected(profile_id):
        return []
    return local_backup_service.get_flagged_sms(profile_id, limit=limit)


@app.get("/api/calls/{profile_id}")
async def get_calls(profile_id: str, limit: int = 200):
    _require_profile(profile_id)
    # Android verisi öncelikli
    if profile_id in _android_calls:
        return _android_calls[profile_id][:limit]
    # iOS backup fallback
    if local_backup_service.is_connected(profile_id):
        return local_backup_service.get_call_records(profile_id, limit=limit)
    return []


# ── İletişim Güvenlik Analizi ─────────────────────────────────────────────

@app.get("/api/sms/{profile_id}/analyze")
async def analyze_sms(profile_id: str, limit: int = 200):
    """Tüm SMS'leri risk analizi filtresiyle tarar; yüksek riskli olanları risk engine'e kaydeder."""
    _require_profile(profile_id)
    if not local_backup_service.is_connected(profile_id):
        return {"total": 0, "high": 0, "medium": 0, "low": 0, "flagged": []}
    msgs = local_backup_service.get_sms_messages(profile_id, limit=limit)
    summary = {"total": len(msgs), "high": 0, "medium": 0, "low": 0, "flagged": []}
    for m in msgs:
        if m.risk_level == "none":
            continue
        summary[m.risk_level if m.risk_level in summary else "low"] += 1
        summary["flagged"].append({
            "sender":      m.sender,
            "text":        m.text[:120],
            "risk_level":  m.risk_level,
            "timestamp":   str(m.timestamp),
            "is_redacted": m.is_redacted,
        })
        # Risk engine'e kaydet
        risk_engine.record_event(
            profile_id=profile_id,
            event_type="Riskli SMS",
            description=f"{m.sender}: {m.text[:60]}",
            score=50 if m.risk_level == "high" else 30,
        )
    # Alert olarak kaydet
    if summary["flagged"]:
        level = "high" if summary["high"] > 0 else "medium"
        db_service.save_alert(
            profile_id, "sms_risk", level,
            "Riskli SMS Tespit Edildi",
            f"{len(summary['flagged'])} mesajda riskli içerik var.",
            "SMS", len(summary["flagged"]),
        )
    return summary


@app.get("/api/calls/{profile_id}/suspicious")
async def get_suspicious_calls(profile_id: str, limit: int = 200):
    """Gece aramaları, bilinmeyen numaralar ve yoğun tekrar eden aramaları tespit eder."""
    _require_profile(profile_id)
    # Android verisinden de analiz yap
    if profile_id in _android_calls:
        from datetime import datetime as _dt
        calls_raw = _android_calls[profile_id][:limit]
        night, freq_map = [], {}
        for c in calls_raw:
            ts_ms = c.get("timestamp", 0)
            if ts_ms:
                hour = _dt.fromtimestamp(ts_ms / 1000).hour
                if hour >= 22 or hour < 7:
                    night.append({"number": c.get("phone_number","?"), "direction": c.get("direction","?"), "duration": c.get("duration",0), "timestamp": ts_ms})
            num = c.get("phone_number","")
            if num:
                freq_map[num] = freq_map.get(num, 0) + 1
        frequent = [{"number": n, "count": cnt} for n, cnt in sorted(freq_map.items(), key=lambda x: -x[1]) if cnt >= 3]
        return {"total": len(calls_raw), "night_calls": night, "frequent_unknown": frequent[:10]}
    if not local_backup_service.is_connected(profile_id):
        return {"total": 0, "night_calls": [], "frequent_unknown": []}
    calls = local_backup_service.get_call_records(profile_id, limit=limit)
    night, freq_map = [], {}
    for c in calls:
        ts = c.timestamp
        if hasattr(ts, "hour") and (ts.hour >= 22 or ts.hour < 7):
            night.append({
                "number":    getattr(c, "phone_number", "?"),
                "direction": "outgoing" if getattr(c, "is_outgoing", False) else "incoming",
                "duration":  getattr(c, "duration", 0),
                "timestamp": str(ts),
            })
        num = getattr(c, "phone_number", "")
        if num:
            freq_map[num] = freq_map.get(num, 0) + 1
    frequent = [
        {"number": num, "count": cnt}
        for num, cnt in sorted(freq_map.items(), key=lambda x: -x[1])
        if cnt >= 5
    ]
    if night:
        db_service.save_alert(
            profile_id, "night_calls", "medium",
            "Gece Araması Tespit Edildi",
            f"{len(night)} arama 22:00–07:00 arasında gerçekleşti.",
            "Calls", len(night),
        )
    return {"total": len(calls), "night_calls": night, "frequent_unknown": frequent[:10]}


@app.get("/api/screen_time/{profile_id}")
async def get_screen_time(profile_id: str, days: int = 7):
    """Son `days` günün uygulama ekran süresi (knowledgeC.db). Yerel backup gerektirir."""
    _require_profile(profile_id)
    data = screen_time_service.get_screen_time(profile_id, days=days)
    return {"profile_id": profile_id, "days": days, "apps": data, "total": len(data)}


@app.get("/api/comms/{profile_id}/summary")
async def get_comms_summary(profile_id: str):
    """Dashboard Safety Alert için birleşik iletişim riski özeti döndürür."""
    _require_profile(profile_id)
    alerts = []
    # SMS risk (WhatsApp agent)
    try:
        async with httpx.AsyncClient(timeout=3.0) as c:
            r = await c.get(f"http://localhost:3001/api/messages/flagged?limit=100")
            if r.status_code == 200:
                flagged = r.json()
                high = [m for m in flagged if m.get("risk_level") == "high"]
                deleted = [m for m in flagged if m.get("is_deleted")]
                if high:
                    top_sender = high[0].get("sender", "")
                    top_name = _resolve_contact_name(profile_id, top_sender) if top_sender else ""
                    alerts.append({"id": "wa_high", "level": "high",
                        "title": "WhatsApp Riskli Mesaj",
                        "description": f"{len(high)} yüksek riskli WhatsApp mesajı.",
                        "source": "WhatsApp", "count": len(high),
                        "contact_name": top_name or top_sender})
                if deleted:
                    top_sender = deleted[0].get("sender", "")
                    top_name = _resolve_contact_name(profile_id, top_sender) if top_sender else ""
                    alerts.append({"id": "wa_deleted", "level": "medium",
                        "title": "Silinen WhatsApp Mesajı",
                        "description": f"{len(deleted)} mesaj silindi.",
                        "source": "WhatsApp", "count": len(deleted),
                        "contact_name": top_name or top_sender})
    except Exception:
        pass
    # Backup SMS/Calls (mevcut DB alarmları)
    db_alerts = db_service.get_alert_history(profile_id, limit=10)
    for a in db_alerts:
        if a.get("id", "").startswith(f"{profile_id}-sms") or \
           a.get("id", "").startswith(f"{profile_id}-night"):
            alerts.append(a)
    return alerts


# ── YENİ: Tarayıcı geçmişi ─────────────────────────────────────────────────

@app.get("/api/browser/{profile_id}")
async def get_browser_history(profile_id: str, limit: int = 200):
    _require_profile(profile_id)
    api = icloud_service._get_session(profile_id)
    if api:
        items = browser_history.fetch_from_icloud(profile_id, api, limit=limit)
    elif local_backup_service.is_connected(profile_id):
        items = local_backup_service.get_browser_history(profile_id, limit=limit)
    else:
        raise HTTPException(status_code=503, detail="iCloud veya yerel backup bağlantısı yok.")
    risk_engine.process_browser(profile_id, items)
    return {
        "items": items,
        "private_mode_warning": browser_history.PRIVATE_MODE_WARNING
    }


@app.get("/api/browser/{profile_id}/flagged")
async def get_flagged_browser(profile_id: str):
    _require_profile(profile_id)
    api = icloud_service._get_session(profile_id)
    if api:
        items = browser_history.fetch_from_icloud(profile_id, api)
    elif local_backup_service.is_connected(profile_id):
        items = local_backup_service.get_browser_history(profile_id)
    else:
        raise HTTPException(status_code=503, detail="iCloud veya yerel backup bağlantısı yok.")
    return browser_history.get_flagged(items)


# ── YENİ: Geofencing ────────────────────────────────────────────────────────

@app.get("/api/zones/{profile_id}")
async def get_zones(profile_id: str):
    _require_profile(profile_id)
    return geo_service.get_zones(profile_id)


@app.post("/api/zones/{profile_id}")
async def add_zone(profile_id: str, req: AddZoneRequest):
    _require_profile(profile_id)
    zone = geo_service.add_zone(profile_id, req.name, req.latitude, req.longitude, req.radius_meters)
    return zone


@app.delete("/api/zones/{profile_id}/{zone_id}")
async def delete_zone(profile_id: str, zone_id: str):
    _require_profile(profile_id)
    removed = geo_service.delete_zone(profile_id, zone_id)
    return {"removed": removed}


@app.get("/api/zones/{profile_id}/alerts")
async def get_geo_alerts(profile_id: str):
    _require_profile(profile_id)
    return geo_service.get_alerts(profile_id)


# ── YENİ: Risk skoru & bildirim ────────────────────────────────────────────

@app.get("/api/risk/{profile_id}/report")
async def get_risk_report(profile_id: str):
    _require_profile(profile_id)
    report = risk_engine.generate_daily_report(profile_id)
    _profiles[profile_id].daily_risk_score = report.total_score
    # Eşik kontrolü
    cfg = risk_engine.get_config(profile_id)
    if cfg and report.total_score >= cfg.notify_on_score_above and not report.notified:
        asyncio.create_task(notifier.notify_high_risk(cfg, report, _profiles[profile_id].name))
        report.notified = True
    return report


@app.get("/api/risk/{profile_id}/events")
async def get_risk_events(profile_id: str, limit: int = 50):
    _require_profile(profile_id)
    return risk_engine.get_all_events(profile_id, limit=limit)


@app.post("/api/risk/{profile_id}/config")
async def set_notification_config(profile_id: str, req: NotificationConfigRequest):
    _require_profile(profile_id)
    config = NotificationConfig(profile_id=profile_id, **req.model_dump())
    risk_engine.set_config(config)
    return {"saved": True}


@app.get("/api/risk/{profile_id}/config")
async def get_notification_config(profile_id: str):
    _require_profile(profile_id)
    cfg = risk_engine.get_config(profile_id)
    if not cfg:
        raise HTTPException(status_code=404, detail="Bildirim yapılandırması yok.")
    return cfg


# ── Timeline & Alerts ──────────────────────────────────────────────────────

@app.get("/api/timeline/{profile_id}")
async def get_timeline(profile_id: str, limit: int = 40):
    _require_profile(profile_id)
    events = []

    # WhatsApp (Node agent SQLite)
    try:
        async with httpx.AsyncClient(timeout=3.0) as c:
            r = await c.get(f"http://localhost:3001/api/messages?limit={limit}")
            if r.status_code == 200:
                for m in r.json():
                    events.append({
                        "type": "message", "source": "WhatsApp",
                        "title": m.get("chat_name") or m.get("sender", "?"),
                        "subtitle": m.get("text", ""),
                        "ts": m.get("timestamp"),
                        "risk_level": m.get("risk_level", "none"),
                        "is_deleted": m.get("is_deleted", False),
                    })
    except Exception:
        pass

    # SMS (local backup)
    try:
        sms_list = local_backup_service.get_sms_messages(profile_id, limit=limit)
        for m in sms_list:
            events.append({
                "type": "message", "source": "SMS",
                "title": m.sender,
                "subtitle": m.text[:120] if m.text else "",
                "ts": m.timestamp.isoformat() if hasattr(m.timestamp, "isoformat") else str(m.timestamp),
                "risk_level": m.risk_level,
                "is_deleted": False,
            })
    except Exception:
        pass

    # Calls (local backup)
    try:
        calls = local_backup_service.get_call_records(profile_id, limit=limit)
        for c in calls:
            direction = "Outgoing" if getattr(c, "is_outgoing", False) else "Incoming"
            dur = getattr(c, "duration", 0) or 0
            events.append({
                "type": "call", "source": "Calls",
                "title": getattr(c, "phone_number", "?") or "?",
                "subtitle": f"{direction} — {dur//60}m {dur%60}s",
                "ts": c.timestamp.isoformat() if hasattr(c.timestamp, "isoformat") else str(c.timestamp),
                "risk_level": "none",
                "is_deleted": False,
            })
    except Exception:
        pass

    events.sort(key=lambda e: e.get("ts") or "", reverse=True)
    return events[:limit]


@app.get("/api/alerts/{profile_id}")
async def get_alerts(profile_id: str):
    _require_profile(profile_id)
    alerts = []
    try:
        async with httpx.AsyncClient(timeout=3.0) as c:
            r = await c.get("http://localhost:3001/api/messages/flagged?limit=50")
            if r.status_code == 200:
                flagged = r.json()
                deleted_media = [m for m in flagged if m.get("is_deleted") and m.get("has_media")]
                if deleted_media:
                    alerts.append({
                        "id": "deleted_media", "level": "high",
                        "title": "Medyalı Mesaj Silindi",
                        "description": f"{len(deleted_media)} fotoğraf/video içeren mesaj silindi.",
                        "source": "WhatsApp", "count": len(deleted_media),
                    })
                risk_msgs = [m for m in flagged if m.get("risk_level") in ("high", "medium") and not m.get("is_deleted")]
                if risk_msgs:
                    level = "high" if any(m["risk_level"] == "high" for m in risk_msgs) else "medium"
                    alerts.append({
                        "id": "risk_content", "level": level,
                        "title": "Şüpheli Mesaj İçeriği",
                        "description": f"{len(risk_msgs)} mesajda riskli içerik tespit edildi.",
                        "source": "WhatsApp", "count": len(risk_msgs),
                    })
    except Exception:
        pass
    # DB'ye kaydet ve geçmiş alarmlarla birleştir
    for a in alerts:
        db_service.save_alert(
            profile_id, a["id"], a["level"], a["title"],
            a.get("description", ""), a.get("source", ""), a.get("count", 1),
        )
    # Eğer canlı veri yoksa DB geçmişinden dön
    if not alerts:
        alerts = db_service.get_alert_history(profile_id, limit=20)
    return alerts


# ── Ağ Güvenliği — Wi-Fi Bağlantı Geçmişi ────────────────────────────────

class WifiEntry(BaseModel):
    ssid:          str
    bssid:         str | None = None
    signal_dbm:    int | None = None
    security_type: str        = "unknown"
    is_open:       bool       = False
    frequency_mhz: int | None = None
    latitude:      float | None = None
    longitude:     float | None = None
    connected_at:  str
    duration_sec:  int        = 0


class WifiBatch(BaseModel):
    entries: list[WifiEntry]


@app.post("/api/wifi/{profile_id}")
async def post_wifi(profile_id: str, body: WifiBatch):
    """Mobil cihazdan gelen Wi-Fi bağlantı kayıtlarını saklar."""
    _require_profile(profile_id)
    for e in body.entries:
        db_service.save_wifi_connection(
            profile_id, e.ssid, e.bssid, e.signal_dbm, e.security_type,
            e.is_open, e.frequency_mhz, e.latitude, e.longitude,
            e.connected_at, e.duration_sec,
        )
    return {"saved": len(body.entries)}


@app.get("/api/wifi/{profile_id}")
async def get_wifi(profile_id: str, limit: int = 100):
    """Wi-Fi bağlantı geçmişini döndürür."""
    _require_profile(profile_id)
    return db_service.get_wifi_history(profile_id, limit=limit)


@app.get("/api/wifi/{profile_id}/flagged")
async def get_flagged_wifi(profile_id: str):
    """Açık (şifresiz) veya zayıf sinyalli ağları döndürür."""
    _require_profile(profile_id)
    return db_service.get_flagged_wifi(profile_id)


# ── Dijital Detoks — Uygulama Kullanımı & Limitler ────────────────────────

class AppUsageEntry(BaseModel):
    app_name:  str
    package:   str | None = None
    date:      str
    minutes:   int
    launches:  int = 0
    platform:  str = "android"


class AppUsageBatch(BaseModel):
    entries: list[AppUsageEntry]


class AppLimitRequest(BaseModel):
    app_name:       str
    package:        str | None = None
    daily_limit_min: int | None = None
    allow_from:     str | None = None   # "HH:MM"
    allow_until:    str | None = None   # "HH:MM"



@app.post("/api/android-keystrokes/{profile_id}")
async def post_android_keystroke(profile_id: str, body: dict):
    """Android AccessibilityService'ten gelen klavye verilerini kaydeder (JSON body)."""
    _require_profile(profile_id)
    app_name = body.get("app_name", "unknown")
    text = body.get("text", "")
    is_risk_alert = bool(body.get("is_risk_alert", False))
    risk_keyword = body.get("risk_keyword") or None
    if not text:
        return {"status": "skipped"}

    # Duplicate check: aynı uygulama + aynı metin + son 2 saniye içindeyse atla
    dedup_key = (profile_id, app_name)
    now = time.time()
    last = _last_keystroke.get(dedup_key)
    if last and last[0] == text and (now - last[1]) < 2.0:
        return {"status": "duplicate"}
    _last_keystroke[dedup_key] = (text, now)

    db_service.save_keystroke(profile_id, app_name, text,
                              is_risk_alert=is_risk_alert, risk_keyword=risk_keyword)
    keystroke_archiver.archive_keystroke(profile_id, app_name, text)

    # Kelime takibi: kayıtlı keyword listesine karşı tara
    kw_hits = keyword_service.scan_messages(
        profile_id, [{"text": text, "sender": app_name}], source="keyboard"
    )
    for hit in kw_hits:
        asyncio.create_task(
            telegram_notifier.send_telegram_alert(
                f"🔍 **Kelime Uyarısı:** '{hit['keyword']}' — [{app_name}] {text[:60]}"
            )
        )

    if is_risk_alert or risk_keyword:
        desc = f"[{app_name}] Riskli kelime: '{risk_keyword}' → {text[:40]}"
        risk_engine.record_event(
            profile_id=profile_id,
            event_type="Riskli Yazışma",
            description=desc,
            score=50,
        )
        asyncio.create_task(
            telegram_notifier.send_telegram_alert(f"🚨 **Klavye Uyarısı:** {desc}")
        )
    else:
        risk_level, _ = risk_engine.analyze_text(text)
        if risk_level != "none":
            desc = f"[{app_name}] Android riskli yazışma: {text[:40]}"
            risk_engine.record_event(
                profile_id=profile_id,
                event_type="Riskli Yazışma",
                description=desc,
                score=40 if risk_level == "high" else 20,
            )
            asyncio.create_task(
                telegram_notifier.send_telegram_alert(f"⚠️ **Riskli Yazışma:** {desc}")
            )
    return {"status": "logged"}


@app.post("/api/android-keystrokes-batch/{profile_id}")
async def post_android_keystroke_batch(profile_id: str, body: dict):
    """Android AccessibilityService toplu (batch) klavye verilerini kaydeder.
    Body: {"entries": [{"app_name":..., "package":..., "text":..., "timestamp":..., "is_risk_alert":false}]}
    """
    _require_profile(profile_id)
    entries = body.get("entries", [])
    logged = 0
    for entry in entries:
        app_name = entry.get("app_name", "unknown")
        text = entry.get("text", "")
        is_risk_alert = bool(entry.get("is_risk_alert", False))
        risk_keyword = entry.get("risk_keyword") or None
        if not text:
            continue
        db_service.save_keystroke(profile_id, app_name, text,
                                  is_risk_alert=is_risk_alert, risk_keyword=risk_keyword)
        keystroke_archiver.archive_keystroke(profile_id, app_name, text)

        # Kelime takibi
        kw_hits = keyword_service.scan_messages(
            profile_id, [{"text": text, "sender": app_name}], source="keyboard"
        )
        for hit in kw_hits:
            asyncio.create_task(
                telegram_notifier.send_telegram_alert(
                    f"🔍 **Kelime Uyarısı:** '{hit['keyword']}' — [{app_name}] {text[:60]}"
                )
            )

        risk_level, _ = risk_engine.analyze_text(text)
        if risk_level != "none":
            desc = f"[{app_name}] Android riskli yazışma: {text[:40]}"
            risk_engine.record_event(
                profile_id=profile_id,
                event_type="Riskli Yazışma",
                description=desc,
                score=40 if risk_level == "high" else 20,
            )
            asyncio.create_task(
                telegram_notifier.send_telegram_alert(f"⚠️ **Riskli Yazışma:** {desc}")
            )
        logged += 1
    return {"status": "logged", "count": logged}


@app.post("/api/keystrokes/{profile_id}")
async def post_keystroke(profile_id: str, app_name: str, text: str):
    """iOS Klavyeden gelen tuş basışlarını kaydeder ve risk taraması yapar."""
    _require_profile(profile_id)
    
    # Veritabanına kaydet (LoggerView için)
    db_service.save_keystroke(profile_id, app_name, text)
    
    # Günlük metin dosyasına arşivle
    keystroke_archiver.archive_keystroke(profile_id, app_name, text)
    
    # Risk taraması yap
    risk_level, risk_cats = risk_engine.analyze_text(text)
    if risk_level != "none":
        desc = f"[{app_name}] Uygulamasında riskli içerik yazıldı: {text[:40]}..."
        risk_engine.record_event(
            profile_id=profile_id,
            event_type="Riskli Yazışma",
            description=desc,
            score=40 if risk_level == "high" else 20
        )
        # Telegram üzerinden anlık uyar
        asyncio.create_task(telegram_notifier.send_telegram_alert(f"⚠️ **Riskli Yazışma:** {desc}"))
        
    return {"status": "logged"}


@app.get("/api/logs/keystrokes/{profile_id}")
async def list_daily_logs(profile_id: str):
    """Günlük not dosyalarını listeler."""
    _require_profile(profile_id)
    return keystroke_archiver.get_daily_log_list(profile_id)


@app.get("/api/logs/keystrokes/{profile_id}/{filename}")
async def get_log_content(profile_id: str, filename: str):
    """Belirli bir günlük dosyasının içeriğini döner."""
    _require_profile(profile_id)
    # Güvenlik kontrolü: Sadece kendi profilinin dosyalarını okuyabilsin
    if not filename.startswith(profile_id):
        raise HTTPException(status_code=403, detail="Erişim reddedildi.")
    
    filepath = keystroke_archiver.LOG_DIR / filename
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="Dosya bulunamadı.")
    
    async with aiofiles.open(filepath, mode='r', encoding='utf-8') as f:
        content = await f.read()
    return {"content": content}


@app.get("/api/restrictions/{profile_id}")
async def get_restrictions(profile_id: str):
    """Mevcut kısıtlamaları ve hayalet mod ayarlarını döner."""
    _require_profile(profile_id)
    return restriction_service.load_config()


@app.post("/api/restrictions/{profile_id}")
async def update_restrictions(profile_id: str, config: dict):
    """Kısıtlamaları (blok listesi, detoks vb.) günceller."""
    _require_profile(profile_id)
    restriction_service.save_config(config)
    return {"status": "updated"}

@app.get("/api/keystrokes/{profile_id}")
async def get_keystrokes(profile_id: str, limit: int = 200):
    _require_profile(profile_id)
    return db_service.get_keystroke_history(profile_id, limit=limit)

@app.post("/api/app-usage/{profile_id}")
async def post_app_usage(profile_id: str, body: AppUsageBatch):
    """Mobil cihazdan gelen uygulama kullanım verisini kaydeder."""
    _require_profile(profile_id)
    for e in body.entries:
        db_service.upsert_app_usage(
            profile_id, e.app_name, e.package,
            e.date, e.minutes, e.launches, e.platform,
        )
    return {"saved": len(body.entries)}


@app.get("/api/app-usage/{profile_id}")
async def get_app_usage(profile_id: str, date: str | None = None, limit: int = 100):
    """Günlük uygulama kullanım sürelerini döndürür."""
    _require_profile(profile_id)
    return db_service.get_app_usage(profile_id, date=date, limit=limit)


@app.get("/api/app-limits/{profile_id}")
async def get_app_limits(profile_id: str):
    """Tanımlı tüm uygulama limitlerini döndürür."""
    _require_profile(profile_id)
    return db_service.get_app_limits(profile_id)


@app.post("/api/app-limits/{profile_id}")
async def set_app_limit(profile_id: str, body: AppLimitRequest):
    """Bir uygulama için günlük süre veya saat aralığı limiti tanımlar."""
    _require_profile(profile_id)
    db_service.save_app_limit(
        profile_id, body.app_name, body.package,
        body.daily_limit_min, body.allow_from, body.allow_until,
    )
    return {"saved": True, "app_name": body.app_name}


@app.delete("/api/app-limits/{profile_id}/{app_name}")
async def delete_app_limit(profile_id: str, app_name: str):
    """Bir uygulamanın limitini kaldırır."""
    _require_profile(profile_id)
    removed = db_service.delete_app_limit(profile_id, app_name)
    if not removed:
        raise HTTPException(status_code=404, detail="Limit bulunamadı.")
    return {"removed": True}


# ── Keyword Takip ────────────────────────────────────────────────────────────

class KeywordRequest(BaseModel):
    keyword: str
    scope: str = "all"   # all | whatsapp | sms
    action: str = "notify"

@app.get("/api/keywords/{profile_id}")
async def list_keywords(profile_id: str):
    _require_profile(profile_id)
    return keyword_service.get_keywords(profile_id)

@app.post("/api/keywords/{profile_id}")
async def add_keyword(profile_id: str, body: KeywordRequest):
    _require_profile(profile_id)
    return keyword_service.add_keyword(profile_id, body.keyword, body.scope, body.action)

@app.delete("/api/keywords/{profile_id}/{keyword_id}")
async def delete_keyword(profile_id: str, keyword_id: int):
    _require_profile(profile_id)
    removed = keyword_service.delete_keyword(profile_id, keyword_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Keyword bulunamadı.")
    return {"removed": True}

@app.get("/api/keywords/{profile_id}/hits")
async def keyword_hits(profile_id: str, limit: int = 200):
    _require_profile(profile_id)
    return keyword_service.get_hits(profile_id, limit)

@app.post("/api/keywords/{profile_id}/scan")
async def keyword_scan(profile_id: str):
    """SMS + WhatsApp mesajlarını kayıtlı keyword'lere karşı tarar."""
    _require_profile(profile_id)
    sms = db_service.get_message_history(profile_id, limit=500)
    hits = keyword_service.scan_messages(profile_id, sms, "sms")
    return {"scanned": len(sms), "hits": hits}


# ── Anomaly Detection ─────────────────────────────────────────────────────────

@app.get("/api/anomalies/{profile_id}")
async def get_anomalies(profile_id: str):
    """Davranışsal anomalileri tespit eder ve döndürür."""
    _require_profile(profile_id)
    return risk_engine.detect_anomalies(profile_id)


# ── Communication Map ────────────────────────────────────────────────────────

def _resolve_contact_name(profile_id: str, sender: str) -> str:
    """sender (telefon/JID) → rehberdeki isim. Bulunamazsa sender döner."""
    contacts = _android_contacts.get(profile_id, [])
    if not contacts:
        return sender
    # JID'den telefon numarasını çıkar: "905551234567@s.whatsapp.net" → "905551234567"
    phone = sender.split("@")[0].lstrip("+").replace(" ", "").replace("-", "")
    for c in contacts:
        for p in (c.get("phones") or [c.get("phone_number", "")]):
            clean = str(p).lstrip("+").replace(" ", "").replace("-", "")
            if clean and (clean == phone or clean.endswith(phone[-9:]) or phone.endswith(clean[-9:])):
                return c.get("name") or sender
    return sender


@app.get("/api/contacts/{profile_id}/map")
async def contacts_map(profile_id: str, limit: int = 50):
    """SMS + WhatsApp mesajlarından iletişim frekans haritası döndürür."""
    _require_profile(profile_id)
    from collections import defaultdict

    agg: dict = defaultdict(lambda: {
        "message_count": 0, "flagged_count": 0,
        "deleted_count": 0, "sources": set(), "last_seen": "",
    })

    # DB'den mesajlar (SMS + iCloud WA)
    for msg in db_service.get_message_history(profile_id, limit=5000):
        sender = (msg.get("sender") or "").strip()
        if not sender:
            continue
        a = agg[sender]
        a["message_count"] += 1
        if msg.get("is_deleted"):
            a["deleted_count"] += 1
        if msg.get("risk_level") in ("high", "medium"):
            a["flagged_count"] += 1
        ts = str(msg.get("timestamp", ""))
        if ts > a["last_seen"]:
            a["last_seen"] = ts
        a["sources"].add(msg.get("source") or "sms")

    # WhatsApp agent canlı mesajlar
    try:
        async with httpx.AsyncClient(timeout=3.0) as c:
            r = await c.get("http://localhost:3001/api/messages?limit=2000")
            if r.status_code == 200:
                for msg in r.json():
                    if msg.get("is_from_me"):
                        continue
                    sender = (msg.get("sender") or "").strip()
                    if not sender:
                        continue
                    a = agg[sender]
                    a["message_count"] += 1
                    if msg.get("is_deleted"):
                        a["deleted_count"] += 1
                    if msg.get("risk_level") in ("high", "medium"):
                        a["flagged_count"] += 1
                    ts = str(msg.get("timestamp", ""))
                    if ts > a["last_seen"]:
                        a["last_seen"] = ts
                    a["sources"].add("whatsapp")
    except Exception:
        pass

    result = []
    for sender, data in agg.items():
        total = data["message_count"]
        flagged = data["flagged_count"]
        deleted = data["deleted_count"]
        if flagged / max(total, 1) > 0.3 or deleted > 5:
            risk = "high"
        elif flagged > 0 or deleted > 0:
            risk = "medium"
        else:
            risk = "none"
        resolved = _resolve_contact_name(profile_id, sender)
        result.append({
            "name": sender,
            "contact_name": resolved,
            "message_count": total,
            "flagged_count": flagged,
            "deleted_count": deleted,
            "sources": list(data["sources"]),
            "last_seen": data["last_seen"],
            "risk_level": risk,
        })

    result.sort(key=lambda x: x["message_count"], reverse=True)
    return result[:limit]


# ── Android Rehber ───────────────────────────────────────────────────────────

_android_contacts: dict = {}  # {profile_id: [{"contact_id", "name", "phone_number", ...}]}


@app.post("/api/android-contacts/{profile_id}")
async def receive_android_contacts(profile_id: str, body: dict):
    """Android rehber listesini alır ve hafızada tutar."""
    _require_profile(profile_id)
    contacts = body.get("contacts", [])
    _android_contacts[profile_id] = contacts
    return {"status": "ok", "count": len(contacts)}


@app.get("/api/android-contacts/{profile_id}")
async def get_android_contacts(profile_id: str):
    """Daha önce gönderilen Android rehber listesini döndürür."""
    _require_profile(profile_id)
    return _android_contacts.get(profile_id, [])


# ── Android Agent Bildirimleri ────────────────────────────────────────────────

@app.post("/api/android-notifications/{profile_id}")
async def receive_android_notification(profile_id: str, body: dict):
    """Android bildirim ajanından gelen olayları kaydeder."""
    _require_profile(profile_id)
    event = body.get("event", "posted")
    package = body.get("package", "")
    title = body.get("title")
    text = body.get("text")
    key = body.get("notification_key")
    timestamp = body.get("timestamp") or datetime.now(timezone.utc).isoformat()
    original = body.get("original_posted_at")
    db_service.save_android_notification(
        profile_id, event, package, title, text, key, timestamp, original
    )
    if event == "deleted":
        risk_engine.record_event(
            profile_id, "deleted_message",
            f"Silinen bildirim: {title} ({package.split('.')[-1]})",
            risk_engine._SCORE_TABLE.get("deleted_message", 20),
            {"package": package, "title": title, "text": text},
        )
    # Supabase Realtime — device_status son bildirim alanını güncelle
    asyncio.create_task(supabase_heartbeat.push_android_notification(profile_id, body))
    return {"status": "saved"}


@app.get("/api/android-notifications/{profile_id}")
async def list_android_notifications(profile_id: str, limit: int = 200):
    """Tüm Android bildirimlerini döndürür."""
    _require_profile(profile_id)
    return db_service.get_android_notifications(profile_id, limit=limit)


@app.get("/api/android-notifications/{profile_id}/deleted")
async def list_deleted_android_messages(profile_id: str, limit: int = 100):
    """Silinen Android bildirim mesajlarını döndürür."""
    _require_profile(profile_id)
    return db_service.get_android_notifications(profile_id, limit=limit, deleted_only=True)


# ── Profil Ayarları (Telegram, bildirim vb.) ──────────────────────────────────

_profile_settings: dict = {}  # {profile_id: {telegram_token, telegram_chat_id, ...}}
_SETTINGS_FILE = os.path.join(os.path.dirname(__file__), "data", "profile_settings.json")


def _load_profile_settings():
    try:
        if os.path.exists(_SETTINGS_FILE):
            with open(_SETTINGS_FILE, "r") as f:
                _profile_settings.update(json.load(f))
    except Exception:
        pass


def _save_profile_settings():
    try:
        os.makedirs(os.path.dirname(_SETTINGS_FILE), exist_ok=True)
        with open(_SETTINGS_FILE, "w") as f:
            json.dump(_profile_settings, f)
    except Exception:
        pass


_load_profile_settings()


@app.get("/api/settings/{profile_id}")
async def get_profile_settings(profile_id: str):
    """Profil ayarlarını döndürür (telegram token dahil)."""
    _require_profile(profile_id)
    s = _profile_settings.get(profile_id, {})
    return {
        "telegram_token": s.get("telegram_token", ""),
        "telegram_chat_id": s.get("telegram_chat_id", ""),
    }


@app.post("/api/settings/{profile_id}")
async def save_profile_settings(profile_id: str, body: dict):
    """Profil ayarlarını kaydeder ve Telegram'ı günceller."""
    _require_profile(profile_id)
    current = _profile_settings.get(profile_id, {})
    if "telegram_token" in body:
        current["telegram_token"] = body["telegram_token"]
    if "telegram_chat_id" in body:
        current["telegram_chat_id"] = body["telegram_chat_id"]
    _profile_settings[profile_id] = current
    _save_profile_settings()
    # telegram_notifier'ı runtime'da güncelle
    if current.get("telegram_token"):
        import services.telegram_notifier as _tn
        _tn.TELEGRAM_TOKEN = current["telegram_token"]
        _tn.TELEGRAM_CHAT_ID = current.get("telegram_chat_id", "")
    return {"status": "ok"}


# ── Uygulama Şifresi (Device Admin Koruma) ────────────────────────────────────

_app_passwords: dict = {}
_APP_PASS_FILE = os.path.join(os.path.dirname(__file__), "data", "app_passwords.json")

def _load_app_passwords():
    try:
        if os.path.exists(_APP_PASS_FILE):
            with open(_APP_PASS_FILE, "r") as f:
                _app_passwords.update(json.load(f))
    except Exception:
        pass

def _save_app_passwords():
    try:
        os.makedirs(os.path.dirname(_APP_PASS_FILE), exist_ok=True)
        with open(_APP_PASS_FILE, "w") as f:
            json.dump(_app_passwords, f)
    except Exception:
        pass

_load_app_passwords()


@app.get("/api/app-password/{profile_id}")
async def get_app_password_status(profile_id: str):
    """Profil için uygulama şifresi ayarlanmış mı döndürür."""
    _require_profile(profile_id)
    return {"has_password": bool(_app_passwords.get(profile_id))}


@app.post("/api/app-password/{profile_id}")
async def set_app_password(profile_id: str, body: dict):
    """Profil için uygulama şifresini ayarlar veya sıfırlar."""
    _require_profile(profile_id)
    password = body.get("password", "").strip()
    if password:
        _app_passwords[profile_id] = password
    else:
        _app_passwords.pop(profile_id, None)
    _save_app_passwords()
    return {"status": "ok", "has_password": bool(password)}


@app.post("/api/app-password/{profile_id}/verify")
async def verify_app_password(profile_id: str, body: dict):
    """Girilen şifrenin doğru olup olmadığını kontrol eder."""
    _require_profile(profile_id)
    entered = body.get("password", "")
    stored = _app_passwords.get(profile_id, "")
    return {"valid": bool(stored and entered == stored)}


# ── WhatsApp Agent Proxy (CORS-safe, frontend → backend → WA agent) ───────────

_WA_AGENT = os.getenv("WA_AGENT_URL", "http://localhost:3001")

@app.get("/api/wa/messages")
async def proxy_wa_messages(limit: int = 300):
    """WhatsApp agent'ından mesajları proxy ederek frontend'e iletir."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as c:
            r = await c.get(f"{_WA_AGENT}/api/messages?limit={limit}")
            if r.status_code == 200:
                return r.json()
    except Exception:
        pass
    return []


@app.get("/api/wa/messages/flagged")
async def proxy_wa_flagged(limit: int = 200):
    """WhatsApp agent'ından riskli/silinen mesajları proxy eder."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as c:
            r = await c.get(f"{_WA_AGENT}/api/messages/flagged?limit={limit}")
            if r.status_code == 200:
                return r.json()
    except Exception:
        pass
    return []


@app.get("/api/wa/health")
async def proxy_wa_health():
    """WhatsApp agent sağlık durumunu proxy eder."""
    try:
        async with httpx.AsyncClient(timeout=3.0) as c:
            r = await c.get(f"{_WA_AGENT}/health")
            if r.status_code == 200:
                return r.json()
    except Exception:
        pass
    return {"connected": False, "status": "unreachable"}


# ── Android Device Info ────────────────────────────────────────────────────────

@app.post("/api/android-device/{profile_id}")
async def register_android_device(profile_id: str, body: dict):
    """Android ajan cihaz bilgilerini kaydeder (model, os, battery, wifi)."""
    _require_profile(profile_id)
    db_service.save_android_device_info(profile_id, body)
    # Supabase Realtime — cihaz bilgilerini device_status tablosuna yaz
    asyncio.create_task(supabase_heartbeat.push_heartbeat(profile_id, extra={
        "model": body.get("model", ""),
        "os_version": body.get("os_version", ""),
        "battery_level": body.get("battery_level", 100),
        "is_charging": body.get("is_charging", False),
    }))
    return {"status": "saved"}


@app.get("/api/android-device/{profile_id}")
async def get_android_device(profile_id: str):
    """Son kaydedilen Android cihaz bilgilerini döndürür."""
    _require_profile(profile_id)
    return db_service.get_android_device_info(profile_id) or {}


# ── Remote Diagnostics ────────────────────────────────────────────────────────

_WEBRTC_SERVER = os.getenv("WEBRTC_SERVER_URL", "http://localhost:8001")

@app.get("/api/diagnostics/{profile_id}")
async def get_diagnostics(profile_id: str):
    """Bağlı WebRTC cihazlarının anlık sistem durumunu döndürür."""
    _require_profile(profile_id)
    try:
        async with httpx.AsyncClient(timeout=3.0) as c:
            r = await c.get(f"{_WEBRTC_SERVER}/api/diagnostics")
            if r.status_code == 200:
                return r.json()
    except Exception:
        pass
    return []


# ── Haftalık Rapor ────────────────────────────────────────────────────────

@app.post("/api/reports/{profile_id}/weekly")
async def send_weekly_report(profile_id: str, email: str | None = None):
    """Haftalık PDF raporu oluşturur ve e-posta ile gönderir."""
    from datetime import timezone
    _require_profile(profile_id)
    profile = _profiles[profile_id]

    now = datetime.now(timezone.utc)
    week_start = now - timedelta(days=7)

    # Risk olayları
    risk_events = risk_engine.get_all_events(profile_id, limit=200)
    week_events = [
        ev for ev in risk_events
        if getattr(ev, "timestamp", None) and getattr(ev, "timestamp") >= week_start
    ]

    # Günlük skorlar (son 7 gün)
    daily_scores = []
    for i in range(7):
        day = (week_start + timedelta(days=i)).date()
        day_events = [
            ev for ev in week_events
            if getattr(ev, "timestamp", None) and getattr(ev, "timestamp").date() == day
        ]
        score = min(100, sum(getattr(ev, "score", 0) for ev in day_events))
        daily_scores.append({
            "date": day.strftime("%d.%m.%Y"),
            "score": score,
            "level": weekly_report_svc._score_to_level(score),
        })

    # Uyarılar
    alerts = db_service.get_alert_history(profile_id, limit=50)
    alert_list = [
        {
            "title":       a.get("title", ""),
            "level":       a.get("level", "none"),
            "description": a.get("description", ""),
            "source":      a.get("source", ""),
        }
        for a in (alerts if isinstance(alerts, list) else [])
    ]

    # Konum geçmişi
    location_points: list = []
    try:
        locs = icloud_service.get_location(_profiles[profile_id])
        if locs:
            location_points = [locs] if isinstance(locs, dict) else list(locs)
    except Exception:
        pass

    # Özet sayaçlar
    deleted_msg_count   = sum(1 for ev in week_events if "sil" in str(getattr(ev, "event_type", "")).lower())
    risky_app_count     = sum(1 for ev in week_events if "uygulama" in str(getattr(ev, "event_type", "")).lower())
    geofence_exit_count = sum(1 for ev in week_events if "bölge" in str(getattr(ev, "event_type", "")).lower())

    pdf_bytes = await asyncio.to_thread(
        weekly_report_svc.build_weekly_pdf,
        profile_name        = profile.name,
        week_start          = week_start,
        week_end            = now,
        risk_events         = week_events,
        daily_scores        = daily_scores,
        location_points     = location_points,
        alerts              = alert_list,
        deleted_msg_count   = deleted_msg_count,
        risky_app_count     = risky_app_count,
        geofence_exit_count = geofence_exit_count,
    )

    avg_score = round(sum(d["score"] for d in daily_scores) / max(len(daily_scores), 1))
    recipient = email or os.getenv("REPORT_EMAIL", "")
    sent      = False
    if recipient:
        sent = await asyncio.to_thread(
            weekly_report_svc.send_weekly_report_email,
            to           = recipient,
            profile_name = profile.name,
            week_start   = week_start,
            pdf_bytes    = pdf_bytes,
            avg_score    = avg_score,
            alert_count  = len(alert_list),
        )

    return {
        "pdf_size_bytes": len(pdf_bytes),
        "email_sent":     sent,
        "recipient":      recipient or None,
        "week_start":     week_start.date().isoformat(),
        "week_end":       now.date().isoformat(),
        "avg_risk_score": avg_score,
        "event_count":    len(week_events),
    }


@app.get("/api/reports/{profile_id}/weekly/download")
async def download_weekly_report(profile_id: str):
    """Haftalık PDF raporunu tarayıcıya indirir."""
    from datetime import timezone
    from fastapi.responses import Response
    _require_profile(profile_id)
    profile = _profiles[profile_id]

    now        = datetime.now(timezone.utc)
    week_start = now - timedelta(days=7)

    risk_events  = risk_engine.get_all_events(profile_id, limit=200)
    week_events  = [
        ev for ev in risk_events
        if getattr(ev, "timestamp", None) and getattr(ev, "timestamp") >= week_start
    ]
    daily_scores = []
    for i in range(7):
        day = (week_start + timedelta(days=i)).date()
        day_events = [
            ev for ev in week_events
            if getattr(ev, "timestamp", None) and getattr(ev, "timestamp").date() == day
        ]
        score = min(100, sum(getattr(ev, "score", 0) for ev in day_events))
        daily_scores.append({
            "date": day.strftime("%d.%m.%Y"),
            "score": score,
            "level": weekly_report_svc._score_to_level(score),
        })

    alerts     = db_service.get_alert_history(profile_id, limit=50)
    alert_list = [
        {"title": a.get("title",""), "level": a.get("level","none"),
         "description": a.get("description",""), "source": a.get("source","")}
        for a in (alerts if isinstance(alerts, list) else [])
    ]

    pdf_bytes = weekly_report_svc.build_weekly_pdf(
        profile_name        = profile.name,
        week_start          = week_start,
        week_end            = now,
        risk_events         = week_events,
        daily_scores        = daily_scores,
        location_points     = [],
        alerts              = alert_list,
        deleted_msg_count   = sum(1 for ev in week_events if "sil" in str(getattr(ev, "event_type","")).lower()),
        risky_app_count     = sum(1 for ev in week_events if "uygulama" in str(getattr(ev, "event_type","")).lower()),
        geofence_exit_count = sum(1 for ev in week_events if "bölge" in str(getattr(ev, "event_type","")).lower()),
    )

    filename = f"guvenlik_raporu_{profile.name.lower().replace(' ','_')}_{week_start.strftime('%Y%m%d')}.pdf"
    return Response(
        content      = pdf_bytes,
        media_type   = "application/pdf",
        headers      = {"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── Events & Bookmarks ────────────────────────────────────────────────────

@app.get("/api/events/{profile_id}")
async def get_events(profile_id: str, limit: int = 100):
    """Cihaz takvim etkinliklerini döndürür (iCloud backup Calendar.sqlitedb)."""
    _require_profile(profile_id)
    return local_backup_service.get_calendar_events(profile_id, limit=limit)


@app.get("/api/bookmarks/{profile_id}")
async def get_bookmarks(profile_id: str, limit: int = 200):
    """Safari/Chrome yer imlerini döndürür (iCloud backup Bookmarks.db)."""
    _require_profile(profile_id)
    return local_backup_service.get_browser_bookmarks(profile_id, limit=limit)


# ── Onboarding: WhatsApp QR & Connections ────────────────────────────────────

@app.get("/api/whatsapp/qr")
async def get_whatsapp_qr():
    """WhatsApp Agent'tan QR kod veya bağlantı durumunu döndürür."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(f"{_WA_AGENT}/api/qr")
            return r.json()
    except Exception:
        return {"connected": False, "qr_base64": None, "waiting": False,
                "error": "WhatsApp Agent çalışmıyor — cd whatsapp-agent && node index.js"}


@app.get("/api/connections/{profile_id}")
async def get_connections(profile_id: str):
    """Tüm veri kaynaklarının bağlantı durumunu döndürür (onboarding status panel)."""
    profile = _profiles.get(profile_id)

    # iCloud
    if profile and profile.connected:
        icloud_status = "connected"
    elif profile and profile.requires_2fa:
        icloud_status = "needs_2fa"
    else:
        icloud_status = "disconnected"

    # Local Backup
    backup_ok = local_backup_service.is_connected(profile_id) if profile else False

    # Gmail
    gmail_ok = bool(profile and profile.has_gmail)

    # WhatsApp Agent
    wa_connected = False
    wa_pending = False
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            r = await client.get("http://localhost:3001/api/qr")
            data = r.json()
            wa_connected = data.get("connected", False)
            wa_pending = not wa_connected and bool(data.get("qr_base64"))
    except Exception:
        pass

    return {
        "icloud":    icloud_status,
        "backup":    "connected" if backup_ok   else "disconnected",
        "gmail":     "connected" if gmail_ok    else "disconnected",
        "whatsapp":  "connected" if wa_connected else ("pending" if wa_pending else "disconnected"),
    }


# ── Yardımcı ───────────────────────────────────────────────────────────────

def _require_profile(profile_id: str) -> Profile:
    if profile_id not in _profiles:
        raise HTTPException(status_code=404, detail="Profil bulunamadı")
    return _profiles[profile_id]


# ── WhatsApp Local Backup ──────────────────────────────────────────────────────

_WA_BACKUP_DIR = Path(__file__).parent / "data" / "whatsapp_backup"
_WA_BACKUP_DIR.mkdir(parents=True, exist_ok=True)


@app.post("/api/whatsapp-backup/{profile_id}")
async def upload_whatsapp_backup(profile_id: str, request: Request):
    body = await request.json()
    messages = body.get("messages", [])
    source = body.get("source", "local_backup")
    if not messages:
        raise HTTPException(status_code=400, detail="messages boş")

    backup_file = _WA_BACKUP_DIR / f"{profile_id}.json"
    existing: list = []
    if backup_file.exists():
        with open(backup_file, encoding="utf-8") as f:
            existing = json.load(f)

    existing_ids = {m.get("id") for m in existing}
    new_msgs = [m for m in messages if m.get("id") not in existing_ids]
    existing.extend(new_msgs)
    existing.sort(key=lambda m: m.get("timestamp", 0), reverse=True)

    backup_file.write_text(json.dumps(existing, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"status": "ok", "total": len(existing), "new": len(new_msgs), "source": source}


@app.get("/api/whatsapp-backup/{profile_id}")
async def get_whatsapp_backup(profile_id: str, limit: int = 200):
    backup_file = _WA_BACKUP_DIR / f"{profile_id}.json"
    if not backup_file.exists():
        return []
    with open(backup_file, encoding="utf-8") as f:
        messages = json.load(f)
    return messages[:limit]


# ── OTA Güncelleme ─────────────────────────────────────────────────────────────

APK_DIR = Path(__file__).parent / "apk"
APK_DIR.mkdir(exist_ok=True)
APK_VERSION_FILE = APK_DIR / "version.json"
APK_FILE = APK_DIR / "app-release.apk"


def _read_apk_version() -> dict:
    if APK_VERSION_FILE.exists():
        with open(APK_VERSION_FILE, encoding="utf-8") as f:
            return json.load(f)
    return {"version": "1.0.0", "build": 1, "changelog": ""}


@app.get("/api/app/version")
async def get_app_version(request: Request):
    ver = _read_apk_version()
    base = str(request.base_url).rstrip("/")
    return {
        "version":   ver.get("version", "1.0.0"),
        "build":     ver.get("build", 1),
        "url":       f"{base}/api/app/download",
        "changelog": ver.get("changelog", ""),
    }


@app.get("/api/app/download")
async def download_apk():
    if not APK_FILE.exists():
        raise HTTPException(status_code=404, detail="APK bulunamadı")
    return FileResponse(
        path=str(APK_FILE),
        media_type="application/vnd.android.package-archive",
        filename="family-guard.apk",
    )


@app.post("/api/app/upload")
async def upload_apk(
    apk: UploadFile = File(...),
    version: str = Form(...),
    build: int = Form(...),
    changelog: str = Form(""),
):
    content = await apk.read()
    APK_FILE.write_bytes(content)
    ver_data = {"version": version, "build": build, "changelog": changelog}
    APK_VERSION_FILE.write_text(json.dumps(ver_data, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"status": "ok", "version": version, "build": build, "size_bytes": len(content)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:socket_app", host="0.0.0.0", port=8000, reload=True)
