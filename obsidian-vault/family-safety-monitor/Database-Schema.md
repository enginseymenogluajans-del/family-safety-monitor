---
tags: [#database #sqlite #keyring #schema]
---

# Database Schema

See also: [[Backend-API]] | [[WhatsApp-Agent]] | [[Local-Backup-Service]]

## Storage Systems

The project uses **three separate storage mechanisms**:

| Storage           | What                                                      | Where                                      |
| ----------------- | --------------------------------------------------------- | ------------------------------------------ |
| OS Keyring        | Profile credentials, session tokens, backup passphrase    | System keychain (via `keyring` Python lib) |
| SQLite (backend)  | Profile metadata, risk events, zones, notification config | `backend/data/` (db_service.py)            |
| SQLite (WA agent) | WhatsApp messages                                         | `whatsapp-agent/data/messages.db`          |

## Backend SQLite (db_service.py)

### profiles table

```sql
CREATE TABLE profiles (
  id TEXT PRIMARY KEY,
  display_name TEXT,
  email TEXT,
  backup_path TEXT,       -- iTunes backup path
  created_at TIMESTAMP
)
```

### risk_events table

```sql
CREATE TABLE risk_events (
  id TEXT PRIMARY KEY,
  profile_id TEXT,
  event_type TEXT,        -- 'deleted_message' | 'risky_content' | 'geofence_exit' etc.
  score INTEGER,
  detail TEXT,
  created_at TIMESTAMP
)
```

### safe_zones table

```sql
CREATE TABLE safe_zones (
  id TEXT PRIMARY KEY,
  profile_id TEXT,
  name TEXT,
  lat REAL,
  lon REAL,
  radius_m INTEGER
)
```

### notification_config table

```sql
CREATE TABLE notification_config (
  profile_id TEXT PRIMARY KEY,
  email TEXT,
  smtp_host TEXT,
  smtp_port INTEGER,
  smtp_user TEXT,
  threshold INTEGER       -- min risk score to trigger email
)
```

## WhatsApp Agent SQLite (messages.db)

```sql
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  profile_id TEXT,
  from_number TEXT,
  to_number TEXT,
  body TEXT,              -- redacted by contentFilter.js before insert
  timestamp INTEGER,      -- Unix epoch
  is_deleted INTEGER DEFAULT 0,
  has_media INTEGER DEFAULT 0,
  risk_level TEXT,        -- 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE'
  risk_categories TEXT    -- JSON array string
)
```

## OS Keyring Storage

Managed by Python `keyring` library. Keys stored:

| Service Name                 | Key                 | Value                    |
| ---------------------------- | ------------------- | ------------------------ |
| `family-safety-{profile_id}` | `icloud_password`   | iCloud password          |
| `family-safety-{profile_id}` | `backup_passphrase` | iTunes backup passphrase |
| `family-safety-{profile_id}` | `gmail_token`       | Serialized OAuth token   |

## Read-Only Source DBs (from iPhone backup)

These are extracted from iTunes backup and read directly — never written:

| DB File                       | Read By                 | Contains         |
| ----------------------------- | ----------------------- | ---------------- |
| `sms.db`                      | local_backup_service.py | SMS + iMessage   |
| `CallHistory.storedata`       | local_backup_service.py | Call log         |
| `Manifest.db`                 | app_scanner.py          | App bundle IDs   |
| WhatsApp `ChatStorage.sqlite` | icloud_service.py       | WhatsApp history |

## Profile Persistence Flow

```
Backend start → db_service.get_all_profiles()
             → for each profile: keyring.get_password()
             → PyiCloudService(email, password) [auto-reconnect]
             → ready without user re-entering credentials
```
