---
tags: [#frontend #react #vite #views]
---

# Frontend Views

React (Vite) app at `frontend-react/src/`. Runs inside Electron desktop shell.

See also: [[00-Architecture-Overview]] | [[Backend-API]] | [[Database-Schema]]

## Key Files

| File                  | Purpose                                        |
| --------------------- | ---------------------------------------------- |
| `Views.jsx`           | All view components (monolithic, 4000+ lines)  |
| `DashboardView.jsx`   | Main dashboard — profile summary + quick stats |
| `LiveScreenshots.jsx` | Photo/screenshot grid viewer                   |
| `WhatsAppMonitor.jsx` | WhatsApp message browser + risk panel          |

## API Wrapper

All fetch calls use `apiFetch()` — never raw `fetch()`. The wrapper injects:

- `X-API-Key` header from `VITE_API_KEY` env var
- Base URL from `VITE_BACKEND_URL` (defaults to `http://127.0.0.1:8000`)

## View Inventory

### DashboardView

- Calls: `GET /api/profiles`, `GET /api/location/{id}`, `GET /api/risk/{id}/report`
- Shows: profile list, live location, daily risk score

### LiveScreenshots

- Calls: `GET /api/photos/{id}`
- Guard: `Array.isArray(screenshots)` before `.map()` (fixed)

### WhatsAppMonitor

- Calls: `GET /api/messages/{id}`, `GET /api/messages/{id}/flagged`
- Tabs: All messages / Flagged / Deleted

### SMS Tab

- Calls: `GET /api/sms/default`
- Guard: `Array.isArray` applied

### Calls Tab

- Calls: `GET /api/calls/default`
- `call_type` normalized from raw int

### Apps Tab (📱 Uygulamalar)

- Calls: `GET /api/apps/{id}`, `GET /api/apps/{id}/flagged`
- Guard: `Array.isArray` applied (fixed by Frontend Agent)

### Browser Tab (🌐 Tarayıcı)

- Calls: `GET /api/browser/{id}`, `GET /api/browser/{id}/flagged`, `GET /api/bookmarks/{id}`

### Geofence Tab (📍 Geofence)

- Calls: `GET /api/zones/{id}`, `POST /api/zones/{id}`, `DELETE /api/zones/{id}/{zone_id}`

### Risk Report Tab (📊 Risk Raporu)

- Calls: `GET /api/risk/{id}/report`, `GET /api/events/{id}`
- Bug fixed: was using bare `/api/risk/...` without `${BACKEND_URL}` prefix

### WifiView

- Calls wifi history endpoints
- Guards added for `history` and `flagged` arrays (fixed)

### LoggerView

- Calls keystroke logger endpoints
- Guard added for `logs` array (fixed)

### InstalledAppsView

- Guards added for `apps`, `usage`, `limits` arrays (fixed)

### TimelineView

- Guards added for `events` and `anomalies` arrays (fixed)

## CORS

Backend `main.py` has `CORSMiddleware` configured. Frontend origin (Electron `file://` or Vite dev `localhost:5173`) must be in the allowed origins list.

## Planned Views

- iPhone Onboarding UI (iCloud form + 2FA modal + local backup + WhatsApp QR)
- Connection status panel
