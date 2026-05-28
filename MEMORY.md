# Proje MEMORY.md

Çok aşamalı görevlerde bu dosyayı güncelle. Tamamlanan dosyaları tekrar okuma.

---

## Mevcut Durum (2026-05-28)

### Tamamlanan Özellikler ✅

| Özellik                          | Dosyalar                                                       |
| -------------------------------- | -------------------------------------------------------------- |
| SMS kişi isimleri                | `android-agent/.../SmsReader.kt`                               |
| Arama kişi isimleri              | `android-agent/.../CallLogReader.kt`                           |
| Canlı ekran AUTO_MIRROR fix      | `android-agent/.../ScreenStreamManager.kt`                     |
| GPS sürekli takip                | `android-agent/.../LocationHelper.kt`                          |
| Klavye takibi (Handler debounce) | `android-agent/.../SafetyAccessibilityService.kt`              |
| WhatsApp tombstone fix           | `whatsapp-agent/src/revokeHandler.js`, `api.js`                |
| Backend duplicate check          | `backend/main.py`                                              |
| DeviceAdmin koruması             | `android-agent/.../DeviceAdminReceiver.kt`, `device_admin.xml` |
| MainActivity izin zinciri        | `android-agent/.../MainActivity.kt`                            |
| Frontend LoggerView              | `frontend-react/src/Views.jsx`                                 |

---

## Bekleyen Görevler

- [ ] Klavye takibi test edilmedi — logcat çıktısı bekleniyor
- [ ] Supabase Realtime entegrasyonu
- [ ] Ekran kaydı / görüntüsü yakalama (Eyezy benzeri)
- [ ] Screen Time API

---

## ✅ Tamamlanan Görev — Deploy Agent (2026-05-28)

### Oluşturulan Dosyalar

| Dosya                                     | Amaç                                                                |
| ----------------------------------------- | ------------------------------------------------------------------- |
| `.claude/skills/deploy-android/SKILL.md`  | 6-adım Android build+verify pipeline                                |
| `.claude/skills/deploy-electron/SKILL.md` | 5-adım Electron build+verify pipeline                               |
| `.claude/hooks/verify-build-claim.js`     | Bash çıktısında "success" iddiasını yakalar, artifact yoksa bloklar |
| `.claude/verification/`                   | JSON artifact'ların yazıldığı dizin                                 |
| `.claude/settings.json`                   | `Bash` PostToolUse hook eklendi → verify-build-claim.js             |

### Nasıl Çalışır

1. `/deploy-android` → 6 adım çalışır → `.claude/verification/android-deploy.json` yazar
2. Hook her Bash komutundan sonra çalışır
3. Çıktıda "BUILD SUCCESSFUL / Installed / deployed" görürse artifact'ı kontrol eder
4. Artifact yoksa veya 5 dakikadan eskiyse Claude'a uyarı enjekte eder
5. Artifact yokken "başarılı" demek engellenmiş olur

### Aktif Görev

_Sonraki görev bekleniyor._

---

## Kural

- Tamamlanan faz: `✅ FAZ X tamamlandı` yaz, dokunulan dosyaları listele
- Bir sonraki faz: `## Aktif Görev` bölümünü güncelle
- Tamamlanan dosyaları tekrar okuma — MEMORY.md yeterli
