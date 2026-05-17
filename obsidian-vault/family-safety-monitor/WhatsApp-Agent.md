---
tags: [#whatsapp #nodejs #agent #sqlite]
---

# WhatsApp Agent

`whatsapp-agent/` — Node.js live WhatsApp capture service.

See also: [[00-Architecture-Overview]] | [[Backend-API]] | [[Database-Schema]]

## Stack

- **Runtime**: Node.js
- **Library**: whatsapp-web.js (Puppeteer-based, LocalAuth session)
- **Storage**: better-sqlite3 → `whatsapp-agent/data/messages.db`
- **Server**: Express.js, port **3001**

## File Structure

```
whatsapp-agent/
├── index.js          # Entry point: WA client + Express startup
└── src/
    ├── db.js         # SQLite schema + DB helpers
    ├── contentFilter.js  # JS port of classifyRisk + redactText
    ├── waClient.js   # LocalAuth + Puppeteer factory
    ├── messageHandler.js # on('message'): save + risk analysis
    ├── revokeHandler.js  # on('message_revoke_everyone'): is_deleted=1
    └── api.js        # Express routes
```

## QR Flow

```
node index.js
  → Puppeteer launches headless Chrome
  → QR code printed in terminal
  → User scans: WhatsApp → Linked Devices → Link a Device
  → LocalAuth saves session to whatsapp-agent/.wwebjs_auth/
  → Reconnects automatically on restart (no QR needed again)
```

## Message Capture

### Live messages (`messageHandler.js`)

- `on('message')` fires for every incoming/outgoing message
- Body passes through `contentFilter.js` (redactText + classifyRisk)
- Saved to SQLite with `risk_level`, `risk_categories`, `is_deleted=0`

### Deleted messages (`revokeHandler.js`)

- `on('message_revoke_everyone')` fires when any participant deletes a message
- Sets `is_deleted=1`, original body **preserved**
- For messages deleted before agent session started: tombstone record created

## API Endpoints

| Method | Path                              | Description                             |
| ------ | --------------------------------- | --------------------------------------- |
| GET    | `/api/messages?limit=100`         | All messages (Python-compatible schema) |
| GET    | `/api/messages/flagged?limit=200` | Risky + deleted messages                |
| GET    | `/health`                         | Service status                          |

## Environment

```env
# whatsapp-agent/.env
PROFILE_ID=default
PORT=3001
```

## SQLite Schema → `db.js`

```sql
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  profile_id TEXT,
  from_number TEXT,
  body TEXT,
  timestamp INTEGER,
  is_deleted INTEGER DEFAULT 0,
  has_media INTEGER DEFAULT 0,
  risk_level TEXT,
  risk_categories TEXT
)
```

## Integration with Python Backend

The Python backend proxies WhatsApp Agent data via `GET /api/messages/{id}` and `/flagged`. The backend calls `http://localhost:3001/api/messages` internally and maps to `WhatsAppMessage` Pydantic models.

## Risk Scoring for WhatsApp

| Event                  | Points |
| ---------------------- | ------ |
| Deleted msg with media | +40    |
| Self-deleted           | +30    |
| Other-deleted          | +20    |
| High-risk body content | +50    |
