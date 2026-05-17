---
description: Belirtilen dosyayı veya servisi güvenlik, doğruluk ve proje standartları açısından incele.
---

Şu dosyayı veya servisi incele: $ARGUMENTS

Kontrol et:
1. **Güvenlik** — finansal veri redaksiyonu atlanıyor mu, SQL injection var mı, gizli bilgi loglanıyor mu
2. **Anti-delete garantisi** — WhatsApp Agent'ta body sütununa revoke handler'dan yazılıyor mu
3. **Hata yönetimi** — try/except (Python) veya try/catch (JS) eksik mi
4. **Model uyumu** — API yanıtı `backend/services/models.py`'daki Pydantic modeliyle örtüşüyor mu
5. **Proje standartları** — CLAUDE.md'deki güvenlik ilkelerine uygun mu

Bulguları maddeler halinde, kritikten düşüğe doğru sırala.
