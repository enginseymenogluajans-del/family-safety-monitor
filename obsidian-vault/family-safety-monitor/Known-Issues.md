---
tags: [#bugs #issues #known-problems]
---

# Known Issues

Active bugs and limitations in the current codebase.

See also: [[Next-Tasks]] | [[iCloud-Service]] | [[Local-Backup-Service]]

## 1. iCloud 503 Errors

**Symptom:** `GET /api/photos/{id}`, `/api/drive/{id}`, or `/api/messages/{id}` returns 503.

**Cause:** Apple-side rate limiting on iCloud API. Not a code bug. Happens when:

- Too many requests in a short window
- Apple session expired but reconnect hasn't refreshed trust token
- Apple infrastructure issue

**Current state:** No retry/backoff logic implemented.

**Workaround:** Wait and retry manually, or use [[Local-Backup-Service]] for SMS/calls.

**Fix needed:** Exponential backoff wrapper around pyicloud calls in `icloud_service.py`.

---

## 2. Calls Require Encrypted Backup

**Symptom:** `GET /api/calls/{id}` returns empty array even when backup is connected.

**Cause:** `CallHistory.storedata` is only accessible in **encrypted** iTunes backups. Unencrypted backups do not contain it.

**Workaround:** Enable iTunes backup encryption on the iPhone, reconnect via `POST /api/auth/local-backup` with the passphrase.

**Affected service:** [[Local-Backup-Service]]

---

## 3. Telegram Token Missing

**Symptom:** Telegram notifications not sent. No error visible unless checking logs.

**Cause:** `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are empty in `backend/.env`.

**Fix:** See [[Next-Tasks]] — Telegram setup steps.

**File:** `backend/.env`, `backend/services/telegram_notifier.py`

---

## 4. weekly_report.py — hexval() Bug (Fixed)

**Symptom:** PDF weekly report generation crashes with `AttributeError` on color objects.

**Cause:** `reportlab` color objects have `.hexcolor()` (returns `"#rrggbb"` string) not `.hexval()` (returns int). Used in 4 places in font color XML markup.

**Status:** Fixed by Services Agent — all 4 `.hexval()` replaced with `.hexcolor()`.

**File:** `backend/services/weekly_report.py:103,135,136,151`

---

## 5. risk_engine.py — Missing analyze_text() (Fixed)

**Symptom:** `POST /api/keystrokes/{profile_id}` raises `AttributeError: module 'risk_engine' has no attribute 'analyze_text'`.

**Status:** Fixed by Backend Agent — `analyze_text()` added, delegates to `content_filter.classify_risk()`.

**File:** `backend/services/risk_engine.py`

---

## 6. models.py — LocationData device_name (Fixed)

**Symptom:** `GET /api/location/{id}` raises Pydantic `ValidationError` if device_name not in iCloud response.

**Status:** Fixed — `device_name: str = ""` default added.

**File:** `backend/services/models.py`

---

## 7. Mobile — React Native Version Mismatch (Fixed)

**Symptom:** `npm install` in `mobile/` fails or Expo build crashes.

**Cause:** `react-native@0.81.5` + `react@19` incompatible with Expo SDK 54 (expects RN ~0.76, React 18).

**Status:** Fixed — versions downgraded to SDK 54-compatible set.

**File:** `mobile/package.json`

---

## 8. Mobile — All API Calls Missing X-API-Key (Fixed)

**Symptom:** All mobile app API calls return 403.

**Status:** Fixed — `apiFetch()` wrapper added to `mobile/App.tsx`.
