---
tags: [#setup #guide #installation #devops]
---

# Setup Guide

Step-by-step startup for all components.

See also: [[00-Architecture-Overview]] | [[Known-Issues]] | [[WhatsApp-Agent]]

## Prerequisites

- Python 3.10+ (3.11+ recommended)
- Node.js 18+
- iTunes installed (for local backup support on Windows)
- iPhone backup on this machine (optional, for SMS/calls)

## 1. Python Backend (Port 8000)

```bash
cd family-safety-monitor/backend

# First time only:
python -m venv ../.venv
../.venv/Scripts/pip install -r requirements.txt

# Configure:
cp .env.example .env
# Edit .env:
#   API_SECRET_KEY=<generate a random string>
#   TELEGRAM_BOT_TOKEN=<from @BotFather, optional>
#   TELEGRAM_CHAT_ID=<your chat ID, optional>

# Start:
../.venv/Scripts/uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

API docs: http://localhost:8000/docs
Health: http://localhost:8000/health

## 2. WhatsApp Agent (Port 3001)

```bash
cd family-safety-monitor/whatsapp-agent

# First time only:
npm install

# Configure:
cp .env.example .env
# Edit .env:
#   PROFILE_ID=default
#   PORT=3001

# Start:
node index.js
```

- QR code appears in terminal
- Scan with WhatsApp → Linked Devices → Link a Device
- Session auto-saved; no QR needed on next restart

Health: http://localhost:3001/health

## 3. Electron Frontend

```bash
cd family-safety-monitor/frontend-react

# First time only:
npm install

# Configure:
# Create .env:
#   VITE_API_KEY=<same value as API_SECRET_KEY in backend/.env>
#   VITE_BACKEND_URL=http://127.0.0.1:8000

# Start Electron:
node launch-electron.js
```

> **Note:** Do NOT use `ELECTRON_RUN_AS_NODE=1` in environment. Use `launch-electron.js` which unsets it before spawning Electron. See memory note on ELECTRON_RUN_AS_NODE fix.

## 4. Mobile App (optional)

```bash
cd family-safety-monitor/mobile

# Install dependencies:
npm install

# Configure app.json > extra:
#   BACKEND_URL: your Cloudflare tunnel URL (not localhost)
#   API_KEY: same as API_SECRET_KEY

# Development build:
npx expo start
```

For device testing: use a Cloudflare tunnel URL as `BACKEND_URL` — `localhost` won't reach your backend from a physical device.

## 5. iCloud Connection (via UI or API)

```bash
# Via API directly:
curl -X POST http://localhost:8000/api/auth/icloud \
  -H "X-API-Key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email": "you@icloud.com", "password": "yourpassword"}'

# If 2FA required:
curl -X POST http://localhost:8000/api/auth/2fa \
  -H "X-API-Key: YOUR_KEY" \
  -d '{"profile_id": "...", "code": "123456"}'
```

## 6. Local Backup Connection

```bash
curl -X POST http://localhost:8000/api/auth/local-backup \
  -H "X-API-Key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "backup_path": "C:/Users/you/AppData/Roaming/Apple Computer/MobileSync/Backup/DEVICE_ID",
    "passphrase": "optional_if_encrypted"
  }'
```

## Startup Order

1. Backend (must be first — WhatsApp agent and frontend depend on it)
2. WhatsApp Agent (independent, scan QR)
3. Electron Frontend (connects to backend on launch)
