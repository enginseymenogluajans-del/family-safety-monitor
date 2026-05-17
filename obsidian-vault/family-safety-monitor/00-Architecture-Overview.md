---
tags: [#architecture #overview #system]
---

# Family Safety Monitor — Architecture Overview

Rızaya dayalı aile güvenlik izleme sistemi. Hedef platform: **iPhone (iOS only)**.

## System Map

```
┌─────────────────────────────────────────────────────────┐
│                    DATA SOURCES                         │
│  iCloud API  │  iTunes Backup  │  WhatsApp (live QR)   │
│  Gmail OAuth │  pyicloud       │  whatsapp-web.js       │
└──────┬───────┴───────┬─────────┴──────────┬────────────┘
       │               │                    │
       ▼               ▼                    ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────────┐
│  Python      │  │  Python      │  │  Node.js         │
│  FastAPI     │  │  FastAPI     │  │  WhatsApp Agent  │
│  Port 8000   │  │  Port 8000   │  │  Port 3001       │
│  main.py     │  │  services/   │  │  index.js        │
└──────┬───────┘  └──────────────┘  └──────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────┐
│               FRONTEND LAYER                         │
│  Electron + React (frontend-react/)                  │
│  Views.jsx / DashboardView.jsx / LiveScreenshots.jsx │
│  WhatsAppMonitor.jsx                                 │
└──────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────┐
│               MOBILE CLIENT                          │
│  React Native / Expo (mobile/)                       │
│  Cloudflare Tunnel → backend over HTTPS              │
└──────────────────────────────────────────────────────┘
```

## Components

| Component         | Path              | Port | Language            |
| ----------------- | ----------------- | ---- | ------------------- |
| [[Backend-API]]   | `backend/`        | 8000 | Python FastAPI      |
| WhatsApp Agent    | `whatsapp-agent/` | 3001 | Node.js             |
| Electron Frontend | `frontend-react/` | —    | React + Vite        |
| Mobile App        | `mobile/`         | —    | React Native / Expo |

## Data Flow

1. **iCloud** → pyicloud → `icloud_service.py` → FastAPI → Frontend
2. **iTunes Backup** → `local_backup_service.py` → SQLite reads → FastAPI → Frontend
3. **WhatsApp (live)** → whatsapp-web.js QR → `messageHandler.js` → `messages.db` → `GET /api/messages` → Frontend
4. **Gmail** → OAuth2 → `gmail_service.py` → FastAPI → Frontend

## Storage

- **Profile data**: keyring (OS keychain, persistent across restarts)
- **WhatsApp messages**: `whatsapp-agent/data/messages.db` (SQLite, better-sqlite3)
- **Gmail tokens**: `credentials/` directory

## Security Model

- Backend auth: `X-API-Key` middleware (all requests must include header)
- Financial data: redacted at ingestion by `content_filter.py`
- Data stays local — no cloud sync

## Related Notes

- [[Backend-API]]
- [[iCloud-Service]]
- [[Local-Backup-Service]]
- [[WhatsApp-Agent]]
- [[Frontend-Views]]
- [[Database-Schema]]
- [[Setup-Guide]]
- [[Known-Issues]]
- [[Next-Tasks]]
