# Preflight Check

Run this before any integration debugging. Check all 4 items and report pass/fail for each.

## CHECK 1 — .env dosyası ve zorunlu değişkenler

```bash
# backend/.env varlığı
Test-Path backend/.env

# BACKEND_URL ve API_KEY tanımlı mı?
Select-String -Path backend/.env -Pattern "^BACKEND_URL=.+" -Quiet
Select-String -Path backend/.env -Pattern "^API_KEY=.+"   -Quiet

# frontend-react/.env veya .env.local varlığı
Test-Path frontend-react/.env
Test-Path frontend-react/.env.local
Select-String -Path frontend-react/.env* -Pattern "^VITE_API_KEY=.+" -Quiet
```

PASS kriterleri:

- `backend/.env` mevcut
- `BACKEND_URL` boş değil
- `API_KEY` boş değil
- `VITE_API_KEY` frontend env'de mevcut

---

## CHECK 2 — Backend health endpoint yanıt veriyor mu?

```bash
# backend/.env'den URL oku
$url = (Select-String -Path backend/.env -Pattern "^BACKEND_URL=(.+)").Matches[0].Groups[1].Value.Trim()
$apiKey = (Select-String -Path backend/.env -Pattern "^API_KEY=(.+)").Matches[0].Groups[1].Value.Trim()

# /health endpoint'i çağır
curl -s -o /dev/null -w "%{http_code}" -H "X-API-Key: $apiKey" "$url/health"
```

PASS kriterleri:

- HTTP 200 dönüyor
- 3 saniye içinde yanıt veriyor

FAIL ise: Backend çalışmıyor — `uvicorn main:socket_app --host 0.0.0.0 --port 8000` komutu çalıştır.

---

## CHECK 3 — CORS origins frontend URL'ini içeriyor mu?

```bash
grep -n "allow_origins\|CORS\|origins" backend/main.py | head -20
```

PASS kriterleri:

- `allow_origins` listesinde frontend URL veya `*` var
- Üretimde `localhost` yerine gerçek IP/domain var

---

## CHECK 4 — API client'larında hardcoded localhost var mı?

```bash
# Frontend kaynak dosyalarında localhost araması
grep -rn "localhost" frontend-react/src/ --include="*.js" --include="*.jsx" --include="*.ts" --include="*.tsx"

# Android Config.kt kontrolü
grep -n "localhost\|127.0.0.1" android-agent/app/src/main/java/com/familysafety/agent/Config.kt
```

PASS kriterleri:

- Frontend'de hardcoded `localhost` yok (env var kullanılıyor)
- Android Config.kt'de `localhost` yok (gerçek IP var)

FAIL ise: `VITE_API_URL` env var'ına taşı ve `import.meta.env.VITE_API_URL` kullan.

---

## Özet Rapor

Her check için sonucu yaz:

```
✅ CHECK 1 — .env dosyası: BACKEND_URL ve API_KEY mevcut
✅ CHECK 2 — Backend health: 200 OK (192.168.1.175:8000)
⚠️ CHECK 3 — CORS: allow_origins=["*"] — üretimde daraltılmalı
❌ CHECK 4 — Hardcoded localhost: frontend-react/src/api.js:14
```

Herhangi bir ❌ varsa, entegrasyon debug'a geçmeden önce düzelt.
