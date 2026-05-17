# API Integration Audit

**Generated:** 2026-05-11  
**Backend:** `backend/main.py` (FastAPI, port 8000)  
**Frontend:** `frontend-react/src/` (React + Vite)  
**WhatsApp Agent:** `whatsapp-agent/` (Node.js, port 3001)

---

## Methodology

1. All `@app.get/post/delete` routes were extracted from `backend/main.py`.
2. All `apiFetch(...)` calls were extracted from every `.jsx` file in `frontend-react/src/`.
3. URLs, request bodies, response shapes, and auth headers were compared.

---

## Auth Header Analysis

| Layer                               | Mechanism                                                                  | Status              |
| ----------------------------------- | -------------------------------------------------------------------------- | ------------------- |
| Backend `/api/*`                    | Requires `X-API-Key` header (middleware, main.py:90-99)                    | ✅                  |
| `api.js:apiFetch()`                 | Injects `X-API-Key` from `VITE_API_KEY` on every call                      | ✅                  |
| `WhatsAppMonitor.jsx`               | Calls `apiFetch()` targeting port 3001; WA agent has no auth               | ⚠️ Sent but ignored |
| `LiveScreenshots.jsx` (via App.jsx) | `backendUrl` hardcoded to `http://localhost:8000`, bypasses `VITE_API_URL` | ⚠️                  |

---

## Mismatch Table

| #   | Frontend File                 | Backend File                | Issue                                                                                                                                                                                                                                                                                 |
| --- | ----------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | `DashboardView.jsx:533`       | `main.py:1197`              | ✅ **FIXED** — `contact.sender` → `contact.name`                                                                                                                                                                                                                                      |
| M2  | `App.jsx:285`                 | `main.py:259`               | ✅ **FIXED** — `backendUrl` now reads `import.meta.env.VITE_API_URL \|\| "http://localhost:8000"`                                                                                                                                                                                     |
| M3  | `WhatsAppMonitor.jsx:13`      | `whatsapp-agent/src/api.js` | ✅ **FIXED** — `WA_API` now reads `import.meta.env.VITE_WA_URL \|\| "http://localhost:3001"`; `VITE_WA_URL` added to `.env.example`                                                                                                                                                   |
| M4  | `Views.jsx` (GeoFencingView)  | `main.py:716-739`           | ✅ **FIXED** — `GeoFencingView` now fetches all 4 endpoints: zone list, add zone (POST with name/lat/lng/radius form), delete zone, and alert feed with entered/exited event styling                                                                                                  |
| M5  | _(no caller)_                 | `main.py:459-474`           | **Dead endpoint:** `GET /api/photos/archived/{profile_id}` (WhatsApp Agent media archive) is never called from any frontend view; `PhotoView` only calls the iCloud photos endpoint                                                                                                   |
| M6  | `Views.jsx` (RiskView)        | `main.py:744-778`           | ✅ **FIXED** — `RiskView` component added to `Views.jsx`; fetches `/api/risk/default/report` + `/api/risk/default/events?limit=50`; wired into `App.jsx` under "Güvenlik" sidebar section                                                                                             |
| M7  | `Views.jsx:281` (SmsView)     | `main.py:563-568`           | **Unused backend endpoint:** `GET /api/sms/{id}/flagged` exists but is never called; `SmsView` fetches all SMS and filters risk client-side; the `/flagged` endpoint does server-side filtering that goes unused                                                                      |
| M8  | _(no caller)_                 | `main.py:968-969`           | **Wrong parameter binding:** `POST /api/keystrokes/{profile_id}` takes `app_name` and `text` as **query params**, not JSON body — inconsistent with every other POST endpoint which uses a Pydantic body model; called by mobile agent, not frontend, but violates project convention |
| M9  | `Views.jsx:1294` (LimitModal) | `main.py:1064-1072`         | **Missing `package` field:** frontend POSTs `{app_name, daily_limit_min, allow_from, allow_until}` — omits the optional `package` field from `AppLimitRequest`; harmless today but silently drops package-level precision                                                             |

---

## Detailed Findings & Proposed Fixes

### M1 — `contact.sender` → `contact.name` (DashboardView.jsx:533)

**Root cause:** The `/api/contacts/{profile_id}/map` endpoint returns:

```python
# main.py:1197
result.append({"name": sender, "message_count": ..., ...})
```

The frontend reads:

```js
// DashboardView.jsx:533
const name = contact.sender || "?";
```

`contact.sender` is always `undefined`, so the top-contacts widget always displays `"?"`.

**Minimal fix — `DashboardView.jsx:533`:**

```diff
- const name = contact.sender || "?";
+ const name = contact.name || "?";
```

---

### M2 — Hardcoded `backendUrl` for LiveScreenshots (App.jsx:285)

**Root cause:**

```jsx
// App.jsx:285
<LiveScreenshots profileId="default" backendUrl="http://localhost:8000" />
```

All other components derive the URL from `import.meta.env.VITE_API_URL`.

**Minimal fix — `App.jsx:285`:**

```diff
- <LiveScreenshots profileId="default" backendUrl="http://localhost:8000" />
+ <LiveScreenshots profileId="default" backendUrl={import.meta.env.VITE_API_URL || "http://localhost:8000"} />
```

---

### M3 — Hardcoded WA Agent URL (WhatsAppMonitor.jsx:13)

**Root cause:**

```js
// WhatsAppMonitor.jsx:13
const WA_API = "http://localhost:3001";
```

If the WA agent runs on a different host/port (e.g., in Docker or via Cloudflare tunnel), the view silently fails.

**Minimal fix — `WhatsAppMonitor.jsx:13`:**

```diff
- const WA_API = "http://localhost:3001";
+ const WA_API = import.meta.env.VITE_WA_URL || "http://localhost:3001";
```

Add `VITE_WA_URL=http://localhost:3001` to `frontend-react/.env.example`.

---

### M4 — GeoFencingView is a static stub (Views.jsx:1747)

**Root cause:** `GeoFencingView` returns static JSX with no API calls. Backend is fully implemented.

**Available backend endpoints (all unused):**

- `GET  /api/zones/{profile_id}` — list safe zones
- `POST /api/zones/{profile_id}` — add zone (`AddZoneRequest`: `name, latitude, longitude, radius_meters`)
- `DELETE /api/zones/{profile_id}/{zone_id}` — remove zone
- `GET  /api/zones/{profile_id}/alerts` — geofence breach alerts

**Minimal fix — `Views.jsx:1747` (replace stub with live component):**

```js
// Add these fetch calls inside GeoFencingView:
const [zones, setZones] = useState([]);
const [alerts, setAlerts] = useState([]);

useEffect(() => {
  Promise.all([
    apiFetch(`${BACKEND_URL}/api/zones/default`).then((r) =>
      r.ok ? r.json() : [],
    ),
    apiFetch(`${BACKEND_URL}/api/zones/default/alerts`).then((r) =>
      r.ok ? r.json() : [],
    ),
  ]).then(([z, a]) => {
    setZones(z);
    setAlerts(a);
  });
}, []);
```

---

### M5 — Archived WhatsApp Photos Never Fetched (main.py:459)

**Root cause:** Backend exposes:

```python
# main.py:459
GET /api/photos/archived/{profile_id}
```

Returns WA Agent media files from `whatsapp-agent/data/media/`. PhotoView only calls:

```js
// Views.jsx:771
apiFetch(`${BACKEND_URL}/api/photos/${COMMS_PROFILE}?limit=60`); // iCloud only
```

**Minimal fix — `Views.jsx` (PhotoView):** Add a second fetch and merge/tab results:

```js
apiFetch(`${BACKEND_URL}/api/photos/archived/${COMMS_PROFILE}`)
  .then((r) => (r.ok ? r.json() : []))
  .then(setArchivedPhotos);
```

---

### M6 — Risk Report System Disconnected (main.py:744-778)

**Root cause:** Backend has a full risk scoring and notification system:

- `GET /api/risk/{id}/report` — daily risk report (0-100 score, event breakdown)
- `GET /api/risk/{id}/events` — individual risk events
- `GET /api/risk/{id}/config` — notification config
- `POST /api/risk/{id}/config` — set SMTP email, thresholds

None of these are called from any frontend view. The risk data is collected and scored server-side but never displayed.

**Minimal fix:** Wire up in DashboardView.jsx alongside existing `alerts` fetch:

```js
apiFetch(`${API_BASE}/api/risk/${PROFILE_ID}/report`).then(r => r.ok ? r.json() : null),
```

---

### M7 — `/api/sms/{id}/flagged` Unused (main.py:563)

**Root cause:** Backend has both:

- `GET /api/sms/{id}` — all SMS
- `GET /api/sms/{id}/flagged` — pre-filtered risk SMS

`SmsView` fetches all SMS + the `/analyze` summary endpoint, then filters risk client-side. The `/flagged` endpoint is never called, duplicating server-side logic on the client.

**Minimal fix — `Views.jsx:SmsView`:** Replace the client-side risk filter with the server endpoint:

```diff
- apiFetch(`${COMMS_API}/api/sms/${COMMS_PROFILE}/analyze`),
+ apiFetch(`${COMMS_API}/api/sms/${COMMS_PROFILE}/flagged?limit=200`),
```

And update the flagged-tab rows source to use the returned array directly.

---

### M8 — `POST /api/keystrokes/{id}` Uses Query Params Instead of JSON Body (main.py:968)

**Root cause:**

```python
# main.py:968
async def post_keystroke(profile_id: str, app_name: str, text: str):
```

FastAPI will bind `app_name` and `text` from the URL query string. Every other POST in this file uses a Pydantic `BaseModel` body. The mobile iOS keyboard caller must send `POST /api/keystrokes/default?app_name=Safari&text=hello`.

**Minimal fix — `backend/main.py:968`:** Add a Pydantic model and use it:

```python
class KeystrokeRequest(BaseModel):
    app_name: str
    text: str

@app.post("/api/keystrokes/{profile_id}")
async def post_keystroke(profile_id: str, req: KeystrokeRequest):
    db_service.save_keystroke(profile_id, req.app_name, req.text)
    keystroke_archiver.archive_keystroke(profile_id, req.app_name, req.text)
    ...
```

**Note:** Also update the iOS mobile agent caller to send a JSON body.

---

### M9 — `package` Field Missing from App Limit POST (Views.jsx:1294)

**Root cause:** Backend `AppLimitRequest` accepts `package: str | None`. Frontend `LimitModal` sends:

```js
// Views.jsx:1297-1302
{
  (app_name, daily_limit_min, allow_from, allow_until);
}
```

`package` is omitted. For Android apps this causes per-package limits to never be set; for iOS this is harmless (iOS doesn't use package IDs).

**Minimal fix:** No change needed for current iOS-only scope. Add a comment noting the field is available for future Android support.

---

## Complete Endpoint Coverage Matrix

| Endpoint                                | Called From                                                                   | Status                                    |
| --------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------- |
| `GET /health`                           | DashboardView                                                                 | ✅                                        |
| `GET /api/profiles`                     | _(no frontend caller)_                                                        | ⚠️ Unused in UI                           |
| `POST /api/auth/icloud`                 | SetupView                                                                     | ✅                                        |
| `POST /api/auth/2fa`                    | SetupView                                                                     | ✅                                        |
| `POST /api/auth/gmail/{id}`             | _(no frontend caller)_                                                        | ⚠️ Unused in UI                           |
| `POST /api/auth/local-backup`           | SetupView                                                                     | ✅                                        |
| `DELETE /api/profiles/{id}`             | _(no frontend caller)_                                                        | ⚠️ Unused in UI                           |
| `GET /api/location/{id}`                | _(no frontend caller)_                                                        | ⚠️ Unused in UI                           |
| `GET /api/location_history/{id}`        | DashboardView, GpsLocationsView                                               | ✅                                        |
| `GET /api/photos/{id}`                  | PhotoView                                                                     | ✅                                        |
| `GET /api/photos/archived/{id}`         | _(no frontend caller)_                                                        | ❌ **M5**                                 |
| `GET /api/drive/{id}`                   | VideoView                                                                     | ✅                                        |
| `GET /api/messages/{id}`                | _(no frontend caller — WA via port 3001)_                                     | ⚠️                                        |
| `GET /api/messages/{id}/flagged`        | _(no frontend caller)_                                                        | ⚠️                                        |
| `GET /api/emails/{id}`                  | EmailView                                                                     | ✅                                        |
| `GET /api/apps/{id}`                    | InstalledAppsView                                                             | ✅                                        |
| `GET /api/apps/{id}/flagged`            | _(no frontend caller)_                                                        | ⚠️                                        |
| `GET /api/sms/{id}`                     | SmsView                                                                       | ✅                                        |
| `GET /api/sms/{id}/flagged`             | _(no frontend caller)_                                                        | ❌ **M7**                                 |
| `GET /api/sms/{id}/analyze`             | SmsView                                                                       | ✅                                        |
| `GET /api/calls/{id}`                   | CallsView                                                                     | ✅                                        |
| `GET /api/calls/{id}/suspicious`        | CallsView                                                                     | ✅                                        |
| `GET /api/comms/{id}/summary`           | DashboardView                                                                 | ✅                                        |
| `GET /api/browser/{id}`                 | BrowserHistoryView                                                            | ✅                                        |
| `GET /api/browser/{id}/flagged`         | BrowserHistoryView                                                            | ✅                                        |
| `GET /api/zones/{id}`                   | `GeoFencingView` (Views.jsx)                                                  | ✅ **M4 fixed**                           |
| `POST /api/zones/{id}`                  | `GeoFencingView` (Views.jsx)                                                  | ✅ **M4 fixed**                           |
| `DELETE /api/zones/{id}/{zone_id}`      | `GeoFencingView` (Views.jsx)                                                  | ✅ **M4 fixed**                           |
| `GET /api/zones/{id}/alerts`            | `GeoFencingView` (Views.jsx)                                                  | ✅ **M4 fixed**                           |
| `GET /api/risk/{id}/report`             | `RiskView` (Views.jsx)                                                        | ✅ **M6 fixed**                           |
| `GET /api/risk/{id}/events`             | `RiskView` (Views.jsx)                                                        | ✅ **M6 fixed**                           |
| `GET /api/risk/{id}/config`             | _(no frontend caller)_                                                        | ⚠️ config reads not wired (out of scope)  |
| `POST /api/risk/{id}/config`            | _(no frontend caller)_                                                        | ⚠️ config writes not wired (out of scope) |
| `GET /api/timeline/{id}`                | DashboardView, TimelineView                                                   | ✅                                        |
| `GET /api/alerts/{id}`                  | DashboardView                                                                 | ✅                                        |
| `GET /api/wifi/{id}`                    | WifiView                                                                      | ✅                                        |
| `GET /api/wifi/{id}/flagged`            | WifiView                                                                      | ✅                                        |
| `POST /api/wifi/{id}`                   | _(mobile agent only)_                                                         | ✅                                        |
| `GET /api/app-usage/{id}`               | _(no frontend caller)_                                                        | ⚠️                                        |
| `POST /api/app-usage/{id}`              | _(mobile agent only)_                                                         | ✅                                        |
| `GET /api/app-limits/{id}`              | InstalledAppsView                                                             | ✅                                        |
| `POST /api/app-limits/{id}`             | InstalledAppsView                                                             | ✅                                        |
| `DELETE /api/app-limits/{id}/{app}`     | InstalledAppsView                                                             | ✅                                        |
| `GET /api/keywords/{id}`                | KeywordView                                                                   | ✅                                        |
| `POST /api/keywords/{id}`               | KeywordView                                                                   | ✅                                        |
| `DELETE /api/keywords/{id}/{kw_id}`     | KeywordView                                                                   | ✅                                        |
| `GET /api/keywords/{id}/hits`           | KeywordView                                                                   | ✅                                        |
| `POST /api/keywords/{id}/scan`          | KeywordView                                                                   | ✅                                        |
| `GET /api/anomalies/{id}`               | TimelineView                                                                  | ✅                                        |
| `GET /api/contacts/{id}/map`            | DashboardView, ContactsView                                                   | ✅ **M1 fixed**                           |
| `GET /api/screenshots/{id}`             | LiveScreenshots                                                               | ✅                                        |
| `POST /api/screenshots/take/{id}`       | DashboardView, LiveScreenshots                                                | ✅                                        |
| `GET /api/keystrokes/{id}`              | LoggerView                                                                    | ✅                                        |
| `POST /api/keystrokes/{id}`             | _(mobile agent only)_                                                         | ❌ **M8** (query params)                  |
| `GET /api/logs/keystrokes/{id}`         | DailyLogsView                                                                 | ✅                                        |
| `GET /api/logs/keystrokes/{id}/{file}`  | DailyLogsView                                                                 | ✅                                        |
| `GET /api/restrictions/{id}`            | BlockCallsView, BlockWifiView, BlockWebsitesView, BlockAppsView, SettingsView | ✅                                        |
| `POST /api/restrictions/{id}`           | BlockCallsView, BlockWifiView, BlockWebsitesView, BlockAppsView, SettingsView | ✅                                        |
| `GET /api/diagnostics/{id}`             | LiveControlView                                                               | ✅                                        |
| `GET /api/android-notifications/{id}`   | _(no frontend caller)_                                                        | ⚠️                                        |
| `POST /api/android-notifications/{id}`  | _(android agent only)_                                                        | ✅                                        |
| `POST /api/reports/{id}/weekly`         | _(no frontend caller)_                                                        | ⚠️                                        |
| `GET /api/reports/{id}/weekly/download` | _(no frontend caller)_                                                        | ⚠️                                        |
| `GET /api/events/{id}`                  | EventsView                                                                    | ✅                                        |
| `GET /api/bookmarks/{id}`               | BrowserBookmarkView                                                           | ✅                                        |
| `GET /api/whatsapp/qr`                  | SetupView                                                                     | ✅                                        |
| `GET /api/connections/{id}`             | SetupView                                                                     | ✅                                        |

---

## Priority Summary

| Priority | Mismatch                                    | Impact                                        |
| -------- | ------------------------------------------- | --------------------------------------------- |
| ✅ Fixed | M1 — `contact.sender` → `contact.name`      | Top contacts widget always blank              |
| ✅ Fixed | M2 — hardcoded `backendUrl` in App.jsx      | Breaks in non-localhost deploys               |
| ✅ Fixed | M3 — hardcoded `WA_API`                     | WA tab breaks if agent port changes           |
| ✅ Fixed | M6 — Risk system disconnected               | Risk scores never shown in UI                 |
| ✅ Fixed | M4 — GeoFencingView stub                    | Geofencing feature completely non-functional  |
| 🟢 Low   | M5 — archived photos endpoint unused        | WA media archive not accessible               |
| 🟢 Low   | M7 — `/sms/flagged` unused                  | Minor efficiency issue                        |
| 🟢 Low   | M8 — keystroke POST uses query params       | Mobile agent must use non-standard call style |
| 🟢 Low   | M9 — `package` field missing from app limit | No impact on current iOS-only scope           |
