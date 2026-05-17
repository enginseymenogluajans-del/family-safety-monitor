---
tags: [#backend #backup #itunes #service]
---

# Local Backup Service

`backend/services/local_backup_service.py` — reads iTunes/Finder iPhone backups.

See also: [[iCloud-Service]] | [[Backend-API]] | [[Known-Issues]]

## Purpose

Offline alternative to iCloud API. Reads SQLite databases extracted from iPhone backups stored on the local machine. Works with both **unencrypted** and **encrypted** backups.

## What It Reads

| Data           | Source DB                      | Endpoint              |
| -------------- | ------------------------------ | --------------------- |
| SMS messages   | `sms.db`                       | `GET /api/sms/{id}`   |
| Call history   | `CallHistory.storedata`        | `GET /api/calls/{id}` |
| Installed apps | `Manifest.db` (AppDomain scan) | `GET /api/apps/{id}`  |

## Backup Connection

```
POST /api/auth/local-backup
Body: { "backup_path": "/path/to/backup", "passphrase": "optional" }
```

- `backup_path` stored in `db_service` profile record
- `passphrase` stored in OS keyring
- Auto-reconnects on backend restart

## Encrypted Backup Support

- Uses `iphone-backup-decrypt` library
- Passphrase required to decrypt before SQLite read
- Without passphrase, only **unencrypted** backups work

## Known Limitation: Calls Need Encrypted Backup

`CallHistory.storedata` is **only available in encrypted backups**. If a user connects an unencrypted backup, `GET /api/calls/{id}` returns empty. See [[Known-Issues]].

## SMS Processing

All SMS message bodies pass through `content_filter.py`:

- Financial data redacted
- Risk level classified (HIGH / MEDIUM / LOW)
- Flagged messages available at `/api/sms/{id}/flagged`

## Call Record Fields

```python
CallRecord:
  - phone_number: str
  - call_type: str   # "incoming" | "outgoing" | "missed"
  - duration: int    # seconds
  - date: datetime
```

`call_type` is normalized from the raw integer flag in `CallHistory.storedata`.

## App Detection

`app_scanner.py` scans `Manifest.db` AppDomain entries against a known list of risky app bundle IDs:

- Dating: Tinder, Bumble, Grindr, etc.
- Adult: OnlyFans
- Gambling: various
- Chat/social apps flagged separately
