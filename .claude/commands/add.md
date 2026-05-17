---
description: Yeni özellik ekle — servis, model ve endpoint. Önce plan gösterir, onay alır.
---

context.md dosyasını OKU. Sonra şunu yap:

**$ARGUMENTS** özelliğini projeye ekle:

1. `backend/services/` altına yeni servis dosyası oluştur
2. `backend/services/models.py`'a gerekli Pydantic modeli ekle
3. `backend/main.py`'a endpoint ekle

**Kurallar:**
- Mevcut kodu bozma
- Önce uygulama planını göster, onay al, sonra kodla
- Her adımı ayrı ayrı yaz
