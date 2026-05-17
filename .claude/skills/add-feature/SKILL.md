---
name: add-feature
description: Projeye yeni bir izleme özelliği ekle. Yeni veri kaynağı, endpoint veya frontend sekmesi eklerken kullan.
allowed-tools: Read, Edit, Write, Bash, Glob, Grep
---

# Yeni Özellik Ekleme

## Adımlar

### 1. Model (backend/services/models.py)
Yeni veri yapısı gerektiriyorsa Pydantic model ekle:
```python
class YeniModel(BaseModel):
    profile_id: str
    # ... alanlar
```

### 2. Servis (backend/services/)
`backend/services/` altında yeni servis dosyası oluştur veya mevcut servisi genişlet.
- İçerik filtresi için `content_filter.py`'daki `analyze_whatsapp_message` fonksiyonunu yeniden kullan
- Risk puanlaması için `risk_engine.py`'daki `process_*` fonksiyonlarını yeniden kullan

### 3. Endpoint (backend/main.py)
```python
@app.get("/api/yeni/{profile_id}")
async def get_yeni(profile_id: str):
    _require_profile(profile_id)
    # servis çağrısı
```

### 4. Frontend (frontend/index.html)
- Tab butonu ekle: `<div class="tab" onclick="switchTab('yeni', this)">🆕 Yeni</div>`
- `loadTab()` içine `else if (tab === 'yeni')` dalı ekle
- `renderYeni(container)` async fonksiyonu yaz

### 5. WhatsApp Agent (whatsapp-agent/) — gerçek zamanlı veri için
- `src/db.js`: yeni sütun veya tablo ekle
- `src/messageHandler.js` veya yeni handler dosyası
- `src/api.js`: yeni Express endpoint

### 6. CLAUDE.md Güncelle
- Tamamlandı listesine ekle
- Dosya yapısına ekle
- API endpoint tablosuna ekle

## Kontrol Listesi
- [ ] Model eklendi
- [ ] Servis yazıldı
- [ ] Endpoint test edildi (`/docs` üzerinden)
- [ ] Frontend sekmesi çalışıyor
- [ ] CLAUDE.md güncellendi
