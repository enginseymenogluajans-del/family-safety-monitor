# Electron Deploy & Verify Agent (Windows)

Autonomous deploy pipeline for the Electron desktop app. Never declare success until all 5 steps pass and the verification artifact is written.

Build dir: `frontend-react/`
Artifact: `frontend-react/dist/*.exe` or `frontend-react/release/`
Verify file: `.claude/verification/electron-deploy.json`

---

## STEP 1 — Read expected version

```powershell
$pkg = Get-Content frontend-react/package.json | ConvertFrom-Json
$EXPECTED_VERSION = $pkg.version
Write-Host "Expected version: $EXPECTED_VERSION"
```

---

## STEP 2 — Build

```powershell
cd frontend-react
npm run build 2>&1
```

Parse output for:

- `success` or exit code 0 → continue
- Any `error` / non-zero exit → stop, report exact error, do not proceed

---

## STEP 3 — Artifact verification (mtime < 120s)

```powershell
# Find the newest .exe in dist/
$exe = Get-ChildItem -Recurse dist\*.exe,release\*.exe -ErrorAction SilentlyContinue |
       Sort-Object LastWriteTime -Descending | Select-Object -First 1

if (-not $exe) { Write-Error "No .exe artifact found — build may have failed silently" }

$age = (Get-Date) - $exe.LastWriteTime
if ($age.TotalSeconds -gt 120) {
    Write-Error "Artifact is stale ($([int]$age.TotalSeconds)s old): $($exe.FullName)"
}
Write-Host "Artifact: $($exe.Name) — age $([int]$age.TotalSeconds)s — OK"
```

FAIL if no artifact found or older than 120 seconds.

---

## STEP 4 — Extract version from artifact name or package

```powershell
# Try to extract version from filename (e.g. family-safety-monitor-1.0.0-setup.exe)
$match = $exe.Name | Select-String -Pattern "(\d+\.\d+\.\d+)"
$ARTIFACT_VERSION = if ($match) { $match.Matches[0].Groups[1].Value } else { "unknown" }
Write-Host "Artifact version: $ARTIFACT_VERSION"

if ($ARTIFACT_VERSION -ne $EXPECTED_VERSION -and $ARTIFACT_VERSION -ne "unknown") {
    Write-Error "Version mismatch: expected $EXPECTED_VERSION, artifact has $ARTIFACT_VERSION"
}
```

---

## STEP 5 — Write verification artifact and report

Only if steps 1-4 all passed:

```powershell
cd ..  # back to project root
$artifact = @{
    timestamp       = [int](Get-Date -UFormat %s)
    version         = $EXPECTED_VERSION
    artifactVersion = $ARTIFACT_VERSION
    artifactPath    = $exe.FullName
    artifactAgeSecs = [int]$age.TotalSeconds
    builtAt         = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
} | ConvertTo-Json

New-Item -ItemType Directory -Force ".claude\verification" | Out-Null
Set-Content -Path ".claude\verification\electron-deploy.json" -Value $artifact
Write-Host "Verification artifact written:"
Write-Host $artifact
```

Paste the full JSON before writing "build successful" or "deployed".

**NEVER write "success", "deployed", or "build succeeded" without pasting the artifact JSON.**
