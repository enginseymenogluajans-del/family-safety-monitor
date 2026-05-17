---
tags: [#tasks #roadmap #todo]
---

# Next Tasks

Planned work and open items. See also: [[Known-Issues]] | [[00-Architecture-Overview]]

## Priority 1 — Telegram Setup

**Goal:** Enable Telegram push notifications for high-risk events.

**Steps:**

1. Message `@BotFather` on Telegram → `/newbot` → copy the token
2. Send any message to your new bot
3. Open `https://api.telegram.org/bot<TOKEN>/getUpdates` in browser
4. Find `"chat": {"id": XXXXXXX}` — that's your `CHAT_ID`
5. Edit `backend/.env`:
   ```
   TELEGRAM_BOT_TOKEN=<your token>
   TELEGRAM_CHAT_ID=<your chat id>
   ```
6. Restart backend — notifications fire automatically when risk score exceeds threshold

**File:** `backend/services/telegram_notifier.py`, `backend/.env`

---

## Priority 2 — Encrypted Backup for Calls

**Goal:** Make `GET /api/calls/{id}` return data.

**Steps:**

1. On the target iPhone: Settings → [your name] → iTunes & App Store (or via Finder on Mac / iTunes on Windows)
2. Enable "Encrypt local backup" and set a passphrase
3. Run a new backup
4. Reconnect via API with passphrase:
   ```bash
   POST /api/auth/local-backup
   { "backup_path": "...", "passphrase": "your_passphrase" }
   ```

**File:** [[Local-Backup-Service]]

---

## Priority 3 — iPhone Onboarding UI

Four-part UI flow (not yet built):

| Part | Description                   | Endpoints Needed                               |
| ---- | ----------------------------- | ---------------------------------------------- |
| 1    | iCloud login form + 2FA modal | `POST /api/auth/icloud`, `POST /api/auth/2fa`  |
| 2    | Local backup connector        | `POST /api/auth/local-backup`                  |
| 3    | WhatsApp QR panel             | `GET /api/whatsapp/qr` (planned endpoint)      |
| 4    | Connection status panel       | `GET /api/connections/{id}` (planned endpoint) |

---

## Priority 4 — Weekly PDF Report

**Goal:** Auto-generate and email weekly risk report as PDF.

**Status:** `weekly_report.py` exists and uses ReportLab. The `.hexval()` bug is fixed.

**Remaining:** Schedule trigger (cron or APScheduler), email delivery via `notifier.py`.

---

## Priority 5 — Anomaly Detection Graphs

**Goal:** Detect and visualize unusual usage patterns.

Examples:

- Late-night phone usage (after midnight)
- Sudden spike in deleted messages
- New contacts appearing frequently
- App usage outside normal hours

**Approach:** Add to `risk_engine.py`, expose via new endpoint, add chart to Risk Report tab in frontend.

---

## Priority 6 — iCloud 503 Retry Logic

**Goal:** Graceful handling of Apple rate limiting.

**Approach:** Wrap pyicloud calls in `icloud_service.py` with exponential backoff (3 retries, 2s/4s/8s delays). Return cached last-known data if all retries fail.

---

## Priority 7 — Contact Communication Map

**Goal:** Visualize who the monitored user communicates with and how frequently.

**Data sources:** SMS (sms.db), WhatsApp messages, calls (CallHistory).
**Output:** Graph of contacts × frequency × time-of-day in frontend.

---

## Out of Scope

- Android agent (iOS only per project scope)
- Uploading data to cloud storage
- Screen recording (banking app screen lock respected)
