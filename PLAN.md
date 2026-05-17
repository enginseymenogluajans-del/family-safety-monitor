# Family Safety Monitor — Build Plan

Her faz tamamlandığında ✓ ekle. Tamamlanan fazın dosyalarını tekrar okuma.

---

## Phase 1 — Altyapı: /health endpoint + Electron startup validation ✓

- [x] `backend/main.py` → GET /health (uptime, profil sayısı, WA agent, WebRTC erişimi)
- [x] `frontend-react/electron/main.cjs` → startBackends() sonrası 3 servise ping, hazır olmadan window açma

## Phase 2 — SMS & Aramalar frontend (backend hazır, UI bağla) ✓

- [x] `Views.jsx` SmsView → /api/sms/{id} + /api/sms/{id}/flagged gerçek veri
- [x] `Views.jsx` CallsView → /api/calls/{id} + /api/calls/{id}/suspicious gerçek veri

## Phase 3 — Fotoğraf & Video frontend ✓

- [x] `Views.jsx` PhotoView → /api/photos/{id} gerçek iCloud fotoğrafları
- [x] `Views.jsx` VideoView → iCloud Drive'dan video listesi (VIDEO_EXTS filtresi)

## Phase 4 — Keyword Takip (backend + frontend sıfırdan) ✓

- [x] `backend/main.py` → /api/keywords/{id} GET/POST/DELETE
- [x] `backend/services/` → keyword_service.py (keyword kayıt + mesajlarda tarama)
- [x] `Views.jsx` KeywordView → gerçek UI

## Phase 5 — Anomali Tespiti ✓

- [x] `backend/services/risk_engine.py` → gece kullanımı + ani artış + pattern tespiti
- [x] `backend/main.py` → /api/anomalies/{id}
- [x] `Views.jsx` → anomali bildirimleri Timeline'a entegre

## Phase 6 — İletişim Haritası ✓

- [x] `backend/main.py` → /api/contacts/{id}/map (SMS + WA'dan contact frekans grafiği)
- [x] `Views.jsx` ContactsView → frekans + risk görselleştirmesi

## Phase 7 — Android Agent (NotificationListenerService) ✓

- [x] Yeni Android projesi (Kotlin) — bildirim yakalama servisi
- [x] Backend endpoint → /api/android-notifications/{id} POST/GET
- [x] Silinen WA mesajı tespiti (WhatsDeleted benzeri)

## Phase 8 — Ekran & Kamera Erişimi

- [ ] Electron: `desktopCapturer` ile ekran görüntüsü/kaydı
- [ ] Mobile: `expo-camera` ile canlı kamera akışı WebRTC üzerinden
- [ ] Backend: ekran görüntüsü kayıt + timeline'a ekleme

## Phase 9 — Sosyal Medya Entegrasyonları

- [ ] Telegram (MTProto API)
- [ ] Instagram DM (iCloud backup parser)
- [ ] SocialMonitorView gerçek veri

---

**Kural:** Faz tamamlanınca ✓ ekle, o fazın dosyalarını bir daha okuma.
