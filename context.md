# Aile Güvenliği Paneli — Tam Bağlam Dosyası (v2)

## Proje Açıklaması
iOS/Android cihaz kullanan aile üyelerini **rızaya dayalı** olarak izleyen güvenlik dashboard'u.
Amaç: Çocukların dijital güvenliğini sağlamak, riskli içerikleri ve silinen mesajları tespit etmek.
Backend: Python FastAPI + pyicloud + Gmail OAuth. Frontend: tek HTML dosyası (vanilla JS).

---

## Dosya Yapısı
```
family-safety-monitor/
├── backend/
│   ├── main.py                    # FastAPI — tüm endpoint'ler
│   ├── requirements.txt
│   ├── .env.example
│   └── services/
│       ├── __init__.py
│       ├── models.py              # Tüm Pydantic modeller
│       ├── content_filter.py      # Finansal redaksiyon + risk sınıflandırma
│       ├── icloud_service.py      # iCloud: konum, fotoğraf, WhatsApp, Drive
│       ├── gmail_service.py       # Gmail OAuth + e-posta
│       ├── app_scanner.py         # ★ Uygulama tespiti
│       ├── browser_history.py     # ★ Safari/Chrome geçmiş analizi
│       ├── geo_service.py         # ★ Geofencing (güvenli bölge)
│       ├── risk_engine.py         # ★ Risk skoru motoru
│       └── notifier.py            # ★ Ebeveyn e-posta bildirimi
├── frontend/
│   └── index.html
├── credentials/
├── run.sh
└── CLAUDE.md
```

---

## Tamamlanan Özellikler ✅

| Özellik | Dosya | Fonksiyon |
|---|---|---|
| iCloud Find My konum | icloud_service.py | get_location() |
| iCloud Photos (banka kartı filtreli) | icloud_service.py | get_photos() |
| iCloud Drive dosya listesi | icloud_service.py | get_drive_items() |
| WhatsApp mesajları (iCloud backup) | icloud_service.py | get_whatsapp_messages() |
| **Silinen WhatsApp mesajları** | icloud_service.py | ZDELETED=1 + WAL checkpoint |
| **Medya tespiti (silinen+medya=yüksek risk)** | icloud_service.py | ZWAMEDIAITEM JOIN |
| Finansal redaksiyon (kart, CVV, PIN) | content_filter.py | redact_text() |
| **OTP ve kripto seed redaksiyonu** | content_filter.py | _OTP_RE, _CRYPTO_RE |
| IBAN göster, diğerlerini gizle | content_filter.py | placeholder tekniği |
| Müstehcen içerik sınıflandırma | content_filter.py | classify_risk() |
| **Uyuşturucu + kumar tespiti** | content_filter.py | risk_patterns HIGH/MEDIUM |
| **Grooming tespiti** | content_filter.py | "kimseye söyleme" pattern |
| Gmail e-posta (OAuth) | gmail_service.py | get_emails() |
| 2FA desteği | icloud_service.py | verify_2fa() |
| **Uygulama tespiti** | app_scanner.py | 20+ uygulama (Tinder, OnlyFans…) |
| **Tarayıcı geçmişi** | browser_history.py | Safari + Chrome SQLite |
| **Geofencing** | geo_service.py | bölge tanımla, çıkışta uyarı |
| **Risk skoru (0-100)** | risk_engine.py | olay bazlı günlük puan |
| **Ebeveyn e-posta bildirimi** | notifier.py | SMTP |

---

## Yeni Servisler — Kısa Açıklama

### app_scanner.py
iCloud Drive klasör adlarından uygulama tespiti yapar.
Kategoriler: dating (medium), adult (high), gambling (medium), chat (low), social (low).
20+ bilinen uygulama: Tinder, Badoo, Grindr, Bumble, OnlyFans, Betboo, WhatsApp, Telegram, Instagram, TikTok...

### browser_history.py
Safari (History.db) ve Chrome (History) SQLite DB'lerini iCloud'dan indirip okur.
Domain risk haritası: adult (high), gambling (medium), dating (low).
⚠️ Gizli sekme geçmişi iOS tarafından hiçbir zaman diske yazılmaz — hiçbir araç göremez.

### geo_service.py
Haversine mesafe hesabı ile güvenli bölge (ev, okul, spor salonu) kontrolü.
Bölgeden çıkış/giriş tespiti → anlık uyarı + risk puanı.

### risk_engine.py
Tüm olayları toplayıp günlük 0-100 arası risk skoru üretir.
Puan tablosu:
- Silinen mesaj (medyalı): +40
- Kendi sildiği mesaj: +30
- Yüksek riskli içerik: +50
- Riskli uygulama: +35
- Riskli site: +35
- Geofence çıkışı: +25
- Gece kullanımı: +15

### notifier.py
SMTP ile ebeveyne e-posta gönderir.
Tetikleyiciler: risk skoru eşik aşımı, geofence çıkışı, silinen mesaj.

---

## WhatsApp Silinen Mesaj Mantığı (KRİTİK)

### SQL Sorgusu
```sql
SELECT ... COALESCE(ZWAMESSAGE.ZDELETED, 0) AS zdeleted,
       mi.ZMEDIAURL, mi.ZMEDIALOCALPATH, (mi.Z_PK IS NOT NULL) AS zhas_media
FROM ZWAMESSAGE
LEFT JOIN ZWAMEDIAITEM mi ON ZWAMESSAGE.ZMEDIAITEM = mi.Z_PK
WHERE (ZWAMESSAGE.ZTEXT IS NOT NULL OR ZWAMESSAGE.ZDELETED = 1)
```

### WAL Checkpoint
```python
conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
```
ChatStorage.sqlite-wal ve -shm dosyaları da indirilir.

### Risk Kuralları
| Durum | Risk | Puan |
|---|---|---|
| is_deleted + has_media | HIGH | +40 |
| is_deleted + is_from_me | HIGH | +30 |
| is_deleted + karşı taraf silmiş | MEDIUM | +20 |
| ZTEXT NULL + ZDELETED=1 | placeholder göster | — |

---

## API Endpoint'leri

### Mevcut
```
GET  /api/profiles
POST /api/auth/icloud
POST /api/auth/2fa
POST /api/auth/gmail/{id}
DELETE /api/profiles/{id}
GET /api/status/{id}
GET /api/location/{id}          ← geofence kontrolü dahil
GET /api/photos/{id}
GET /api/drive/{id}
GET /api/messages/{id}          ← risk engine günceller
GET /api/messages/{id}/flagged  ← silinen mesajlar dahil
GET /api/emails/{id}
```

### Yeni
```
GET  /api/apps/{id}              ← tespit edilen uygulamalar
GET  /api/apps/{id}/flagged      ← sadece riskli
GET  /api/browser/{id}           ← tarayıcı geçmişi
GET  /api/browser/{id}/flagged   ← riskli siteler
GET  /api/zones/{id}             ← güvenli bölgeler
POST /api/zones/{id}             ← bölge ekle
DELETE /api/zones/{id}/{zone_id}
GET  /api/zones/{id}/alerts      ← bölge uyarıları
GET  /api/risk/{id}/report       ← günlük risk raporu
GET  /api/risk/{id}/events       ← risk olayları
POST /api/risk/{id}/config       ← bildirim ayarları
GET  /api/risk/{id}/config
```

---

## Teknik Kısıtlar

| Özellik | Durum | Not |
|---|---|---|
| Gizli sekme geçmişi | ❌ İMKANSIZ | iOS diske yazmaz |
| Silinen WhatsApp (backup öncesi) | ✅ Kısmi | ZDELETED=1 + ZTEXT dolu |
| Silinen WhatsApp (backup sonrası) | ❌ | ZTEXT=NULL |
| Anlık silinen mesaj | ❌ | Backup günde 1 kez |
| WhatsApp E2EE backup | ❌ | Şifreli, okunamaz |
| Instagram DM | ❌ | API yok |
| Gerçek zamanlı SMS | ❌ | iOS sandbox |
| Jailbreak (iPhone 16, iOS 18+) | ❌ | Public jailbreak yok |

---

## Güvenlik İlkeleri
1. Finansal veri toplanmaz — kart, CVV, PIN, OTP, kripto redakte edilir
2. Banka uygulamaları engellenir (BLOCKED_FINANCIAL_APPS listesi)
3. Veriler sadece yerel ağda kalır (ev sunucusu)
4. Rıza gerekli

---

## Yapılacak (Sonraki Adımlar)

### Öncelik 1 — Frontend
- [ ] Yeni sekmeler: 📱 Uygulamalar, 🌐 Tarayıcı, 📍 Geofence, 📊 Risk Raporu
- [ ] Silinen mesajlara 🗑️ rozeti + kırmızı kenarlık
- [ ] Risk skoru göstergesi (gauge/bar)

### Öncelik 2 — Gelişmiş Özellikler
- [ ] Ekran kaydı/görüntüsü yakalama (Eyezy benzeri, ReplayKit API)
- [ ] Screen Time API entegrasyonu
- [ ] Haftalık PDF rapor
- [ ] İletişim haritası (kiminle ne sıklıkta)
- [ ] Anomali tespiti (gece kullanımı, ani artışlar)

### Öncelik 3 — Altyapı
- [ ] Android agent (Accessibility Service — jailbreak gereksiz)
- [ ] Profil verilerini JSON dosyasında kalıcı saklama
- [ ] WebSocket ile gerçek zamanlı dashboard güncelleme

---

## Çalıştırma
```bash
cd family-safety-monitor/backend
cp .env.example .env   # SMTP bilgilerini düzenle
pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```
Dashboard: http://localhost:8000 | API docs: http://localhost:8000/docs
