---
description: Her iki servisin çalışıp çalışmadığını ve bağlı profilleri kontrol et.
---

Projenin mevcut durumunu kontrol et:

1. `http://localhost:8000/api/profiles` — Python backend ayakta mı, profil var mı
2. `http://localhost:3001/health` — WhatsApp Agent ayakta mı
3. `whatsapp-agent/data/messages.db` var mı, kaç mesaj kayıtlı
4. `whatsapp-agent/.wwebjs_auth/` var mı (oturum açık mı)

Her servis için: ✅ çalışıyor / ❌ kapalı / ⚠️ uyarı şeklinde özetle.
