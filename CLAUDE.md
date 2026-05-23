# Aile Güvenliği Paneli

## Yarın Yapılacaklar

- SMS ve arama listesinde kişi isimleri görünmüyor sorunu çözülecek
  - SmsReader.kt ve CallLogReader.kt'de getContactName() eklendi ama çalışmıyor
  - READ_CONTACTS izni kontrol edilecek
  - ContactsContract.PhoneLookup sorgusu debug edilecek
- Canlı ekran siyah görüntü sorunu devam ediyor (ScreenStreamManager)
  - MeshCentral pattern uygulandı: OWN_CONTENT_ONLY|PUBLIC flags, setOnImageAvailableListener
  - Rebuild ve Logcat test edilecek
- GPS konum takibi aktifleştirilecek

## Referans Kaynaklar

- **NotebookLM Deposu:** https://notebooklm.google.com/notebook/b713b88e-dd23-4922-a767-9d0e4c643eb2
  - Uzaktan erişim teknikleri, WebRTC/socket.io çözümleri, canlı izleme implementasyonları
  - NOT: Claude bu URL'e doğrudan erişemez — içerikleri bu dosyaya veya konuşmaya yapıştırarak kullan

## Environment Context

- Backend runs on Windows machine; frontend/iOS development happens on Mac
- When debugging auth/API issues, FIRST verify which machine is running each service
- File edits on Mac do NOT automatically reach the Windows backend - confirm sync or deployment before re-testing

## Windows Ortam Kuralları

- Bu proje **Windows'ta çalışıyor** — Linux/Mac komutları kullanma
- `mkdir -p` yerine `mkdir` kullan (PowerShell: `New-Item -ItemType Directory -Force`)
- `rm -rf` yerine `Remove-Item -Recurse -Force` kullan
- Python sanal ortam aktifleştirme: `.\.venv\Scripts\activate` (Linux'taki `source .venv/bin/activate` değil)
- Path ayırıcısı: backslash `\` kullan (`/` değil) — örn. `backend\main.py`
- **Interactive terminal başlatma** — dev server, `expo start`, `uvicorn --reload` gibi uzun süren komutları Claude çalıştırmaz; kullanıcıya komutu ver
- PowerShell'de `&&` çalışmaz — `;` veya `if ($?) { ... }` kullan
- `2>/dev/null` PowerShell'de çalışmaz — `2>$null` kullan
- Ortam değişkeni okuma: `$env:VARIABLE_NAME` (bash'taki `$VARIABLE_NAME` değil)

## Debugging Checklist

- For 401/auth errors: check env vars and API keys on BOTH client and server machines
- For 'missing endpoint' errors: verify the endpoint isn't failing due to empty data stores (e.g., no default profile) before assuming it's unimplemented
- Python backend targets 3.9 — avoid 3.10+ syntax (match statements, X | Y unions in type hints)

## Session State Management

- Do not re-read or re-scan files that have already been processed in this session. Use MEMORY.md or TodoWrite to track completed work and remaining tasks.
- Maintain a MEMORY.md file to track task completion across phases
- Do NOT re-read files that have already been processed in the current session
- Before reading any file, check MEMORY.md to see if it was already handled
- Apply minimal-diff fixes only; do not rescan the codebase between phases

## File & Directory Conventions

- When cloning repos or creating directories, always confirm the exact target path before proceeding. Never nest a folder inside itself (e.g., skills/skills/). Verify the resulting structure after creation.

## Skills & Plugin Location

- Global/reusable skills belong in `~/.claude/skills/` (user home), NOT in project directories
- Project-specific skills go in `.claude/skills/` within the project
- When cloning external skills repos, place contents directly in target folder (avoid nested skills/skills/ structures)

## Token Kuralları

- Dosya okumadan önce SADECE ilgili dosyayı oku
- Tamamlanan dosyayı tekrar okuma
- context.md'yi her seferinde okuma
- Değişiklik yapacağın dosyayı oku, diğerlerine dokunma
- Frontend ve backend ayrı görevler, birlikte okuma
- Plan modunda çalış: önce 3 satırlık plan göster, onay al, sonra kodla

## Kurallar

- Önce plan göster, onay al, sonra kodla
- Gereksiz dosya okuma; sadece ilgili dosyayı değiştir
- `context.md`'yi her seferinde okuma — sadece `/add` komutuyla istenirse bak

## Scope Discipline

- Make minimal-diff, targeted fixes only
- Do NOT invent issues or fix things the user didn't request (e.g., don't fix wifiCollector or polyfills if they weren't mentioned)
- If a referenced file/test isn't provided, ASK before assuming

## Bug Fixes

- Before attempting fixes, verify the issue actually exists in the relevant codebase. Ask for clarification on scope rather than assuming.
- Do NOT assume files or issues exist without first verifying. Always check the actual codebase before applying fixes. Never fix problems that weren't reported or don't exist in the current code.

## State Management

When working on multi-file or multi-phase tasks, create and maintain a MEMORY.md file to track completed files and remaining work. Do NOT re-read files already marked as completed unless explicitly asked.

## Performance & Efficiency

- Do NOT re-read files that have already been read and processed in this session. Track completed work mentally and avoid redundant file scans. If a MEMORY.md exists, consult it before re-exploring.

## Project Structure

- Primary languages: JavaScript, Python, Markdown
- This is a family-safety-monitor project with Electron frontend, React components, Python backend, and React Native (Expo) mobile app
- When making fixes, use minimal diffs only — do not refactor or restructure unless explicitly asked
- This is a multi-component project (Electron desktop app, React frontend, Python backend, React Native/Expo mobile app). Always confirm which component/sub-project a request applies to before making changes.

## Dependencies

- Primary languages: Python (backend), JavaScript (frontend/mobile). When installing packages or importing modules, verify the exact version installed and check available exports before using them.

## Skills & Config File Locations

- Global skills go in ~/.claude/skills/, NOT in the project directory
- Project-specific skills go in .claude/skills/ within the project root
- Always confirm target directory before creating skill files

## Interactive Processes

Do NOT attempt to run long-lived interactive processes (dev servers, watch modes). Instead, provide the exact command for the user to run manually.

## Proje Açıklaması

iOS ve Android cihaz kullanan aile üyelerini **rızaya dayalı** olarak izleyen güvenlik dashboard'u.
Amaç: Çocukların dijital güvenliğini sağlamak, riskli içerikleri tespit etmek.

## Teknik Stack

- **Backend:** Python FastAPI + pyicloud + Gmail OAuth (port 8000), X-API-Key middleware
- **WhatsApp Agent:** Node.js + whatsapp-web.js + better-sqlite3 + Express (port 3001)
- **Frontend:** React (Vite), apiFetch() wrapper (VITE_API_KEY), Views.jsx / DashboardView.jsx / LiveScreenshots.jsx / WhatsAppMonitor.jsx
- **Veritabanı:** keyring (profil kalıcılığı) + `whatsapp-agent/data/messages.db` (SQLite)
- **Bildirim:** SMTP e-posta

## Dosya Yapısı

```
family-safety-monitor/
├── backend/
│   ├── main.py                    # FastAPI ana uygulama, tüm endpoint'ler
│   ├── requirements.txt
│   ├── .env.example
│   └── services/
│       ├── __init__.py
│       ├── models.py              # Pydantic modeller
│       ├── content_filter.py      # Finansal redaksiyon + risk sınıflandırma
│       ├── icloud_service.py      # iCloud bağlantı, konum, fotoğraf, WhatsApp
│       ├── gmail_service.py       # Gmail OAuth + e-posta okuma
│       ├── local_backup_service.py# iTunes/Finder backup: SMS, aramalar, uygulamalar
│       ├── app_scanner.py         # Uygulama tespiti (Tinder, OnlyFans vb.)
│       ├── browser_history.py     # Safari/Chrome geçmiş analizi
│       ├── geo_service.py         # Geofencing (güvenli bölge)
│       ├── risk_engine.py         # Risk skoru motoru
│       └── notifier.py            # Ebeveyn e-posta bildirimi
├── whatsapp-agent/                # Node.js canlı WhatsApp yakalama servisi
│   ├── package.json
│   ├── .env.example               # PROFILE_ID, PORT
│   ├── .gitignore
│   ├── index.js                   # Giriş noktası — WA client + Express başlatır
│   └── src/
│       ├── db.js                  # better-sqlite3 şema + DB yardımcıları
│       ├── contentFilter.js       # JS port: classifyRisk + redactText
│       ├── waClient.js            # LocalAuth + Puppeteer factory
│       ├── messageHandler.js      # on('message'): kaydet + risk analizi
│       ├── revokeHandler.js       # on('message_revoke_everyone'): is_deleted=1
│       └── api.js                 # GET /api/messages, /flagged, /health
├── frontend/                      # React (Vite) uygulaması
│   ├── src/
│   │   ├── Views.jsx              # Sekme yönlendirme
│   │   ├── DashboardView.jsx      # Ana dashboard
│   │   ├── LiveScreenshots.jsx    # Ekran görüntüleri (map guard ekli)
│   │   └── WhatsAppMonitor.jsx    # WhatsApp izleme paneli
│   └── index.html
├── credentials/                   # Gmail OAuth token'ları
├── run.sh                         # Linux/Mac başlatma scripti
└── CLAUDE.md                      # Bu dosya
```

## Mevcut Özellikler

### Tamamlandı ✅

- iCloud Find My konum takibi
- iCloud Photos (banka kartı filtreli)
- iCloud Drive dosya listesi
- WhatsApp mesajları (iCloud backup SQLite)
- **Silinen WhatsApp mesajları** (ZDELETED=1 + WAL dosyası)
- **Medya tespiti** (silinen+medya = yüksek risk)
- Finansal veri redaksiyonu (kart no, CVV, PIN, OTP, kripto seed)
- Müstehcen içerik sınıflandırma (HIGH/MEDIUM/LOW)
- Gmail e-posta (OAuth)
- 2FA desteği
- **Uygulama tespiti** (dating, adult, gambling, chat, social)
- **Tarayıcı geçmişi** (Safari + Chrome, riskli domain tespiti)
- **Geofencing** (güvenli bölge tanımla, çıkışta uyarı)
- **Risk skoru sistemi** (günlük 0-100 puan, olay bazlı)
- **Ebeveyn bildirimi** (e-posta SMTP)
- **Yerel backup desteği** (iTunes/Finder şifreli+şifresiz backup)
- **SMS mesajları** (backup sms.db, content_filter uygulanır)
- **Arama geçmişi** (CallHistory.storedata, gelen/giden/cevapsız)
- **Tam uygulama listesi** (Manifest.db AppDomain tarama)
- **Frontend sekmeler** (📱 Uygulamalar, 🌐 Tarayıcı, 📍 Geofence, 📊 Risk Raporu)
- **WhatsApp Agent** (Node.js, whatsapp-web.js, canlı mesaj + silinen mesaj yakalama, port 3001)
  - on('message'): body redaksiyon + risk analizi → SQLite
  - on('message_revoke_everyone'): is_deleted=1, body korunur; oturum öncesi mesajlar için tombstone
  - GET /api/messages, GET /api/messages/flagged, GET /health
- **SMS sekmesi** — /api/sms/default bağlantısı, Array.isArray guard
- **Arama sekmesi** — /api/calls/default bağlantısı, call_type normalize
- **Profil kalıcılığı** — keyring + backup_path DB'de, başlangıçta auto-reconnect
- **Backend API auth** — X-API-Key middleware, VITE_API_KEY .env
- **apiFetch() wrapper** — tüm 52 fetch() çağrısı React'ta apiFetch() ile değiştirildi
- **React frontend migrate** — Views.jsx, DashboardView.jsx, LiveScreenshots.jsx, WhatsAppMonitor.jsx
- **Events endpoint** — GET /api/events/{profile_id}
- **Bookmarks endpoint** — GET /api/bookmarks/{profile_id}
- **LiveScreenshots TypeError fix** — screenshots.map guard

- [x] **iPhone Onboarding UI** (iCloud, 2FA, Local Backup, WhatsApp QR, Connections panel)
- [x] **Haftalık PDF Raporu** (FastAPI pdf_bytes generation + email SMTP integration)
- [x] **Anomali Tespiti** (Behavioral anomalies, night use)
- [x] **İletişim Haritası** (Aggregated SMS + WA communication stats)
- [ ] **Supabase Realtime Entegrasyonu** (Uzaktan Canlı Kontroller, Cihaz durumu, Canlı Konum ve Canlı Ekran Görüntüsü takibi)
- [ ] Ekran kaydı / görüntüsü yakalama (Eyezy benzeri)
- [ ] Screen Time API entegrasyonu

## API Endpoint'leri

### Profil Yönetimi

- `GET  /api/profiles` — Tüm profiller
- `POST /api/auth/icloud` — iCloud bağlantısı
- `POST /api/auth/2fa` — 2FA doğrulama
- `POST /api/auth/gmail/{id}` — Gmail bağlantısı
- `POST /api/auth/local-backup` — Yerel iTunes backup bağlantısı (backup_path + passphrase)
- `DELETE /api/profiles/{id}` — Profil sil

### Veri

- `GET /api/location/{id}` — Konum (+ geofence kontrolü)
- `GET /api/photos/{id}` — Fotoğraflar
- `GET /api/drive/{id}` — iCloud Drive
- `GET /api/messages/{id}` — WhatsApp mesajları
- `GET /api/messages/{id}/flagged` — Riskli + silinen mesajlar
- `GET /api/emails/{id}` — Gmail

### Yeni Özellikler

- `GET /api/apps/{id}` — Tespit edilen uygulamalar
- `GET /api/apps/{id}/flagged` — Riskli uygulamalar
- `GET /api/browser/{id}` — Tarayıcı geçmişi
- `GET /api/browser/{id}/flagged` — Riskli siteler
- `GET /api/zones/{id}` — Güvenli bölgeler
- `POST /api/zones/{id}` — Bölge ekle
- `DELETE /api/zones/{id}/{zone_id}` — Bölge sil
- `GET /api/zones/{id}/alerts` — Bölge uyarıları
- `GET /api/risk/{id}/report` — Günlük risk raporu
- `GET /api/risk/{id}/events` — Risk olayları
- `POST /api/risk/{id}/config` — Bildirim ayarları
- `GET /api/risk/{id}/config` — Bildirim ayarları oku

### Yerel Backup

- `GET /api/sms/{id}` — SMS mesajları (content_filter uygulanır)
- `GET /api/sms/{id}/flagged` — Riskli/redakte SMS
- `GET /api/calls/{id}` — Arama geçmişi (gelen/giden/cevapsız)

### Diğer

- `GET /api/events/{id}` — Risk olayları akışı
- `GET /api/bookmarks/{id}` — Tarayıcı yer imleri
- `GET /api/connections/{id}` — Bağlantı durumu (onboarding) _(planlandı)_
- `GET /api/whatsapp/qr` — WhatsApp QR kodu _(planlandı)_

## Skills & Global Files

- Global/reusable skills belong in `~/.claude/skills/` (NOT in project directories)
- Project-specific skills go in `.claude/skills/` at the project root
- When cloning external skill repos, clone directly into the target folder (avoid nested `skills/skills/` structures)

## Git & GitHub

- `gh` CLI is not installed; ask user to create GitHub repos manually rather than attempting `gh repo create`
- Watch for git submodule issues when pushing new repos and resolve in a single commit when possible

## Güvenlik İlkeleri

1. **Finansal veri toplanmaz** — Kart, CVV, PIN, OTP, kripto bilgileri redakte edilir
2. **Banka uygulamaları engellenir** — Ekran kaydı/görüntüsü alınmaz
3. **Veriler yerel kalır** — Ev sunucusu/bilgisayar, buluta gitmez
4. **Rıza gerekli** — İzlenen kişinin bilgisi dahilinde

## Çalıştırma

### Python Backend (port 8000)

```bash
cd family-safety-monitor/backend
cp .env.example .env   # Düzenle
pip install -r requirements.txt
uvicorn main:socket_app --host 0.0.0.0 --port 8000 --reload
```

Dashboard: http://localhost:8000 | API docs: http://localhost:8000/docs

### WhatsApp Agent (port 3001)

```bash
cd family-safety-monitor/whatsapp-agent
cp .env.example .env   # PROFILE_ID ve PORT ayarla
npm install
node index.js
# Terminal'de QR kodu tarayın: WhatsApp → Bağlı Cihazlar → Cihaz Ekle
```

Mesajlar: http://localhost:3001/api/messages | Sağlık: http://localhost:3001/health

### WhatsApp Agent Endpoint'leri

- `GET /api/messages?limit=100` — Tüm mesajlar (Python WhatsAppMessage modeliyle uyumlu)
- `GET /api/messages/flagged?limit=200` — Riskli + silinen mesajlar
- `GET /health` — Servis durumu

## Risk Skoru Tablosu

| Olay                    | Puan |
| ----------------------- | ---- |
| Silinen mesaj (medyalı) | +40  |
| Kendi sildiği mesaj     | +30  |
| Karşı tarafın sildiği   | +20  |
| Yüksek riskli içerik    | +50  |
| Orta riskli içerik      | +30  |
| Yüksek riskli uygulama  | +35  |
| Riskli site ziyareti    | +35  |
| Güvenli bölge çıkışı    | +25  |
| Gece kullanımı          | +15  |
