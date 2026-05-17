---
tags: [#backend #icloud #service #pyicloud]
---

# iCloud Service

`backend/services/icloud_service.py` — pyicloud wrapper for iCloud API access.

See also: [[Backend-API]] | [[Known-Issues]] | [[Local-Backup-Service]]

## What It Does

| Feature          | Details                                            |
| ---------------- | -------------------------------------------------- |
| Location         | Find My — real-time device location via iCloud     |
| Photos           | iCloud Photos list (bank card images filtered out) |
| Drive            | iCloud Drive file listing                          |
| WhatsApp backup  | Reads WhatsApp SQLite from iCloud backup           |
| Deleted messages | ZDELETED=1 + WAL file detection                    |

## Authentication Flow

```
POST /api/auth/icloud  →  PyiCloudService(email, password)
                       ↓
                  requires_2fa? → POST /api/auth/2fa → validate_2fa_code()
                       ↓
                  session stored in keyring
                  auto-reconnect on next startup
```

## 2FA Support

- pyicloud handles both SMS and authenticator app 2FA
- Token cached in OS keyring after first successful auth
- Trust token stored to avoid re-auth on restart

## Trust Token Caching

pyicloud stores session cookies in `~/.pyicloud/` by default. Profile sessions are additionally persisted via `keyring` so the backend can auto-reconnect without re-prompting for credentials on startup.

## Current Issue: 503 Errors

See [[Known-Issues]] — Apple periodically returns HTTP 503 on iCloud API calls. This is Apple-side rate limiting, not a code bug. Mitigation:

- Retry with exponential backoff (not yet implemented)
- Fall back to [[Local-Backup-Service]] for SMS/calls/apps
- iCloud Photos and Drive are unaffected by backup-related 503s

## Financial Data Filtering

All photo metadata and WhatsApp message bodies pass through `content_filter.py` before being returned. Redacted:

- Card numbers (VISA/MC/Amex patterns)
- CVV, PIN, OTP codes
- Crypto seed phrases

## Related Services

- `content_filter.py` — redaction + risk classification
- `db_service.py` — profile session persistence
- `local_backup_service.py` — offline alternative when iCloud is unavailable
