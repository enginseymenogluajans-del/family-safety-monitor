---
tags: [#backend #api #fastapi #python]
---

# Backend API

FastAPI uygulaması. Port **8000**. Entry point: `backend/main.py`.

See also: [[00-Architecture-Overview]] | [[Database-Schema]] | [[Known-Issues]]

## Auth

All endpoints require `X-API-Key` header matching `API_SECRET_KEY` in `backend/.env`.

## Endpoint Groups

### Profile Management

| Method | Path                     | Description                               |
| ------ | ------------------------ | ----------------------------------------- |
| GET    | `/api/profiles`          | List all profiles                         |
| POST   | `/api/auth/icloud`       | Connect iCloud account                    |
| POST   | `/api/auth/2fa`          | Submit 2FA code                           |
| POST   | `/api/auth/gmail/{id}`   | Connect Gmail                             |
| POST   | `/api/auth/local-backup` | Connect iTunes backup (path + passphrase) |
| DELETE | `/api/profiles/{id}`     | Delete profile                            |

### Location & Geofencing → `geo_service.py`

| Method | Path                        | Description                       |
| ------ | --------------------------- | --------------------------------- |
| GET    | `/api/location/{id}`        | Current location + geofence check |
| GET    | `/api/zones/{id}`           | List safe zones                   |
| POST   | `/api/zones/{id}`           | Add safe zone                     |
| DELETE | `/api/zones/{id}/{zone_id}` | Remove safe zone                  |
| GET    | `/api/zones/{id}/alerts`    | Geofence violation alerts         |

### iCloud Data → `icloud_service.py`

| Method | Path                         | Description                             |
| ------ | ---------------------------- | --------------------------------------- |
| GET    | `/api/photos/{id}`           | iCloud Photos (financial data redacted) |
| GET    | `/api/drive/{id}`            | iCloud Drive file list                  |
| GET    | `/api/messages/{id}`         | WhatsApp from iCloud backup             |
| GET    | `/api/messages/{id}/flagged` | Risky + deleted WhatsApp msgs           |

### Gmail → `gmail_service.py`

| Method | Path               | Description    |
| ------ | ------------------ | -------------- |
| GET    | `/api/emails/{id}` | Gmail messages |

### Local Backup → `local_backup_service.py`

| Method | Path                    | Description                           |
| ------ | ----------------------- | ------------------------------------- |
| GET    | `/api/sms/{id}`         | SMS messages (content_filter applied) |
| GET    | `/api/sms/{id}/flagged` | Risky/redacted SMS                    |
| GET    | `/api/calls/{id}`       | Call history (in/out/missed)          |

### Apps & Browser → `app_scanner.py`, `browser_history.py`

| Method | Path                        | Description                          |
| ------ | --------------------------- | ------------------------------------ |
| GET    | `/api/apps/{id}`            | All detected apps                    |
| GET    | `/api/apps/{id}/flagged`    | Risky apps (dating, adult, gambling) |
| GET    | `/api/browser/{id}`         | Safari + Chrome history              |
| GET    | `/api/browser/{id}/flagged` | Risky sites                          |
| GET    | `/api/bookmarks/{id}`       | Browser bookmarks                    |
| GET    | `/api/events/{id}`          | Risk event stream                    |

### Risk Engine → `risk_engine.py`

| Method | Path                    | Description                     |
| ------ | ----------------------- | ------------------------------- |
| GET    | `/api/risk/{id}/report` | Daily risk report (0-100 score) |
| GET    | `/api/risk/{id}/events` | Risk events list                |
| POST   | `/api/risk/{id}/config` | Set notification config         |
| GET    | `/api/risk/{id}/config` | Get notification config         |

### Onboarding (planned)

| Method | Path                    | Description             |
| ------ | ----------------------- | ----------------------- |
| GET    | `/api/connections/{id}` | Connection status panel |
| GET    | `/api/whatsapp/qr`      | WhatsApp QR code        |

## Services Map

```
backend/services/
├── models.py              # Pydantic models
├── content_filter.py      # Financial redaction + risk classification
├── icloud_service.py      # pyicloud wrapper
├── gmail_service.py       # Gmail OAuth
├── local_backup_service.py# iTunes/Finder backup: SMS, calls, apps
├── app_scanner.py         # Dating/adult/gambling app detection
├── browser_history.py     # Safari/Chrome history analysis
├── geo_service.py         # Haversine geofencing
├── risk_engine.py         # Daily risk score (0-100)
├── notifier.py            # SMTP email alerts
├── telegram_notifier.py   # Telegram bot alerts
├── weekly_report.py       # ReportLab PDF generation
├── restriction_service.py # App restriction config
├── db_service.py          # SQLite helpers + profile persistence
├── keyword_service.py     # Keyword monitoring
└── keystroke_archiver.py  # Keystroke logging
```

## Risk Score Table

| Event                    | Points |
| ------------------------ | ------ |
| Deleted msg (with media) | +40    |
| Self-deleted msg         | +30    |
| Other-deleted msg        | +20    |
| High-risk content        | +50    |
| Medium-risk content      | +30    |
| High-risk app            | +35    |
| Risky site visit         | +35    |
| Geofence exit            | +25    |
| Late-night usage         | +15    |
